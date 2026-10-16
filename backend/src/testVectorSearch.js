require("dotenv").config();

const connectDB = require("./config/db");
const searchSimilarChunks = require("./services/vectorSearchService");

const test = async () => {
    try {
        await connectDB();

        const documentId = "6ab9ef76364a10b6836674fb";

        const question =
            "What is this document about?";

        console.log("Searching...");
        console.log("Question:", question);
        console.log("Document ID:", documentId);

        const results = await searchSimilarChunks(
            question,
            documentId
        );

        console.log("\nSearch results:");
        console.log("============================");

        results.forEach((result, index) => {
            console.log(`\nResult ${index + 1}`);
            console.log("Chunk index:", result.chunkIndex);
            console.log("Score:", result.score);
            console.log("Text:", result.text);
        });

        console.log("\nTotal results:", results.length);

        process.exit(0);

    } catch (error) {
        console.error(
            "Vector search test failed:",
            error
        );

        process.exit(1);
    }
};

test();