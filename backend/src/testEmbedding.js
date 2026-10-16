require("dotenv").config();

console.log(
    "Gemini API key loaded:",
    process.env.GEMINI_API_KEY ? "YES" : "NO"
);

const generateEmbedding = require("./services/geminiServices");

const test = async () => {
    try {
        const text =
            "Machine learning is a branch of artificial intelligence.";

        const embedding = await generateEmbedding(text);

        console.log("Embedding generated successfully");
        console.log("Embedding length:", embedding.length);
        console.log("First 5 values:", embedding.slice(0, 5));

    } catch (error) {
        console.error("Test failed:", error.message);
    }
};

test();