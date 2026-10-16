const mongoose = require("mongoose");
const Chunk = require("../models/chunk");
const generateEmbedding = require("./geminiServices");

const searchSimilarChunks = async (question, documentId) => {
    try {
        // Step 1: Generate embedding for the user's question
        const queryEmbedding = await generateEmbedding(
            question,
            "RETRIEVAL_QUERY"
        );

        // Step 2: Convert documentId string into MongoDB ObjectId
        const documentObjectId =
            new mongoose.Types.ObjectId(documentId);

        // Step 3: Perform vector search
        const results = await Chunk.aggregate([
            {
                $vectorSearch: {
    index: "vector_index",
    path: "embedding",
    queryVector: queryEmbedding,
    exact:true,
    limit: 5,
    filter: {
        documentId: {
            $eq: documentObjectId
        }
    }
}
            },
            {
                $project: {
                    _id: 1,
                    documentId: 1,
                    chunkIndex: 1,
                    text: 1,
                    score: {
                        $meta: "vectorSearchScore"
                    }
                }
            }
        ]);

        const threshold = 0.70;

const filteredResults = results.filter(
    (result) => result.score >= threshold
);

return filteredResults;
    } catch (error) {
        console.error(
            "Vector search error:",
            error.message
        );

        throw error;
    }
};

module.exports = searchSimilarChunks;