require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const test = async () => {
    try {
        console.log("Checking available Gemini models...\n");

        const models = await ai.models.list();

        for await (const model of models) {
            console.log(model.name);
        }

    } catch (error) {
        console.error("Failed to list Gemini models:");
        console.error(error.message);
    }
};

test();