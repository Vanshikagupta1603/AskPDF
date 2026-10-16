const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const sleep = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

const generateAnswer = async (question, results) => {
    try {

        // Create context from retrieved chunks
        const context = results
            .map((result, index) => {
                return `Chunk ${index + 1}:\n${result.text}`;
            })
            .join("\n\n");

        const prompt = `
You are an AI assistant that answers questions about an uploaded document.

Use ONLY the information provided in the context below.

If the answer cannot be found in the context, say:
"I could not find the answer in the provided document."

Do not make up information.

Context:
${context}

Question:
${question}

Answer:
`;

        // Primary and fallback models
        const models = [
            "gemini-3.7-flash",
            "gemini-3.6-flash"
        ];

        for (const model of models) {

            console.log(`Trying Gemini model: ${model}`);

            const maxRetries = 2;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {

                try {

                    console.log(
                        `Generation attempt ${attempt}/${maxRetries}`
                    );

                    const response =
                        await ai.models.generateContent({
                            model: model,
                            contents: prompt
                        });

                    console.log(
                        `Gemini generation successful using ${model}`
                    );

                    return response.text;

                } catch (error) {

                    console.error(
                        `${model} attempt ${attempt} failed:`,
                        error.message
                    );

                    const isTemporaryError =
                        error.status === 503 ||
                        error.code === 503 ||
                        error.message.includes("503");

                    if (!isTemporaryError) {
                        throw error;
                    }

                    if (attempt < maxRetries) {

                        const delay = attempt * 2000;

                        console.log(
                            `Retrying ${model} in ${delay / 1000} seconds...`
                        );

                        await sleep(delay);
                    }
                }
            }

            console.log(
                `${model} unavailable. Trying fallback model...`
            );
        }

        throw new Error(
            "All Gemini generation models are temporarily unavailable."
        );

    } catch (error) {

        console.error(
            "Gemini answer generation error:",
            error.message
        );

        throw error;
    }
};

const generateAnswerStream = async (
    question,
    results,
    onChunk
) => {
    try {

        // Create context from retrieved chunks
        const context = results
            .map((result, index) => {
                return `Chunk ${index + 1}:\n${result.text}`;
            })
            .join("\n\n");

        const prompt = `
You are an AI assistant that answers questions about an uploaded document.

Use ONLY the information provided in the context below.

If the answer cannot be found in the context, say:
"I could not find the answer in the provided document."

Do not make up information.

Context:
${context}

Question:
${question}

Answer:
`;

        const models = [
            "gemini-3.7-flash",
            "gemini-3.6-flash"
        ];

        for (const model of models) {

            console.log(
                `Trying Gemini streaming model: ${model}`
            );

            const maxRetries = 2;

            for (
                let attempt = 1;
                attempt <= maxRetries;
                attempt++
            ) {

                try {

                    console.log(
                        `Streaming attempt ${attempt}/${maxRetries}`
                    );

                    const response =
                        await ai.models.generateContentStream({
                            model: model,
                            contents: prompt
                        });

                    for await (const chunk of response) {

                        const text = chunk.text;

                        if (text) {
                            onChunk(text);
                        }
                    }

                    console.log(
                        `Gemini streaming successful using ${model}`
                    );

                    return;

                } catch (error) {

                    console.error(
                        `${model} streaming attempt ${attempt} failed:`,
                        error.message
                    );

                    const isTemporaryError =
                        error.status === 503 ||
                        error.code === 503 ||
                        error.message.includes("503");

                    if (!isTemporaryError) {
                        throw error;
                    }

                    if (attempt < maxRetries) {

                        const delay = attempt * 2000;

                        console.log(
                            `Retrying ${model} in ${delay / 1000} seconds...`
                        );

                        await sleep(delay);
                    }
                }
            }

            console.log(
                `${model} unavailable. Trying fallback model...`
            );
        }

        throw new Error(
            "All Gemini streaming models are temporarily unavailable."
        );

    } catch (error) {

        console.error(
            "Gemini streaming error:",
            error.message
        );

        throw error;
    }
};

module.exports = generateAnswer;
module.exports.generateAnswerStream = generateAnswerStream;