// const { GoogleGenAI } = require("@google/genai");

// const ai = new GoogleGenAI({
//     apiKey: process.env.GEMINI_API_KEY
// });

// const generateEmbedding = async (text) => {
//     try {
//         const response = await ai.models.embedContent({
//             model: "gemini-embedding-001",

//             contents: text,

//             config: {
//                 taskType: "RETRIEVAL_DOCUMENT",
//                 outputDimensionality: 768
//             }
//         });

//         return response.embeddings[0].values;

//     } catch (error) {
//         console.error("Gemini embedding error:", error.message);
//         throw error;
//     }
// };

// module.exports = generateEmbedding;
const { GoogleGenAI } = require("@google/genai");

console.log(
    "Gemini service API key:",
    process.env.GEMINI_API_KEY ? "LOADED" : "MISSING"
);

console.log(
    "Vertex AI mode:",
    process.env.GOOGLE_GENAI_USE_VERTEXAI || "NOT SET"
);

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const generateEmbedding = async (
    text,
    taskType = "RETRIEVAL_DOCUMENT"
) => {
    try {
        const response = await ai.models.embedContent({
            model: "gemini-embedding-001",
            contents: text,
            config: {
                taskType: taskType,
                outputDimensionality: 768
            }
        });

        return response.embeddings[0].values;
    } catch (error) {
        console.error("Gemini embedding error:", error.message);
        throw error;
    }
};

module.exports = generateEmbedding;