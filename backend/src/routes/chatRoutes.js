const express = require("express");

const searchSimilarChunks = require("../services/vectorSearchService");
const generateAnswer = require("../services/chatService");
const generateAnswerStream =
    require("../services/chatService").generateAnswerStream;

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const { question, documentId } = req.body;

        // Validate question
        if (!question) {
            return res.status(400).json({
                message: "Question is required"
            });
        }

        // Validate document ID
        if (!documentId) {
            return res.status(400).json({
                message: "Document ID is required"
            });
        }

        console.log("Chat question:", question);
        console.log("Document ID:", documentId);

        // Step 1: Retrieve relevant chunks
        const results = await searchSimilarChunks(
            question,
            documentId
        );

        console.log(
            `Retrieved ${results.length} relevant chunks`
        );

        // Step 2: Check if anything relevant was found
        if (results.length === 0) {
            return res.status(200).json({
                answer:
                    "I could not find relevant information in the provided document.",
                sources: []
            });
        }

        // Step 3: Generate answer using retrieved chunks
        const answer = await generateAnswer(
            question,
            results
        );

        // Step 4: Return answer
        res.status(200).json({
            answer: answer,
            sources: results.map((result) => ({
                chunkIndex: result.chunkIndex,
                score: result.score,
                text: result.text
            }))
        });

    } catch (error) {
    console.error(
        "Chat request failed:",
        error.message
    );

    const isTemporaryGeminiError =
        error.status === 503 ||
        error.code === 503 ||
        error.message.includes("503");

    if (isTemporaryGeminiError) {
        return res.status(503).json({
            message:
                "The AI service is temporarily unavailable. Please try again later."
        });
    }

    res.status(500).json({
        message: "Failed to process chat request"
    });
}
});

router.post("/stream", async (req, res) => {
    try {
        const { question, documentId } = req.body;

        if (!question) {
            return res.status(400).json({
                message: "Question is required"
            });
        }

        if (!documentId) {
            return res.status(400).json({
                message: "Document ID is required"
            });
        }

        console.log("Streaming chat question:", question);
        console.log("Document ID:", documentId);

        // Set SSE response headers
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        // Retrieve relevant chunks
        const results = await searchSimilarChunks(
            question,
            documentId
        );

        console.log(
            `Retrieved ${results.length} relevant chunks`
        );

        // No relevant information found
        if (results.length === 0) {

            res.write(
                `data: ${JSON.stringify({
                    type: "done",
                    answer:
                        "I could not find relevant information in the provided document.",
                    sources: []
                })}\n\n`
            );

            return res.end();
        }

        // Send source information first

        console.log(
    "Source text sent to frontend:",
    results[0]?.text?.slice(0, 500)
);
        res.write(
            `data: ${JSON.stringify({
                type: "sources",
                sources: results.map((result) => ({
                    chunkIndex: result.chunkIndex,
                    score: result.score,
                    text: result.text
                }))
            })}\n\n`
        );

        // Stream Gemini response
        await generateAnswerStream(
            question,
            results,
            (text) => {
                res.write(
                    `data: ${JSON.stringify({
                        type: "chunk",
                        text: text
                    })}\n\n`
                );
            }
        );

        // Tell client streaming is finished
        res.write(
            `data: ${JSON.stringify({
                type: "done"
            })}\n\n`
        );

        res.end();

    } catch (error) {

        console.error(
            "Streaming chat request failed:",
            error.message
        );

        const isTemporaryGeminiError =
            error.status === 503 ||
            error.code === 503 ||
            error.message.includes("503");

        if (!res.headersSent) {

            if (isTemporaryGeminiError) {
                return res.status(503).json({
                    message:
                        "The AI service is temporarily unavailable. Please try again later."
                });
            }

            return res.status(500).json({
                message:
                    "Failed to process streaming chat request"
            });
        }

        // If streaming has already started,
        // send the error through SSE.
        res.write(
            `data: ${JSON.stringify({
                type: "error",
                message:
                    isTemporaryGeminiError
                        ? "The AI service is temporarily unavailable. Please try again later."
                        : "Failed to process streaming chat request"
            })}\n\n`
        );

        res.end();
    }
});

module.exports = router;