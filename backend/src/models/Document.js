// Whenever a user uploads a PDF, we'll eventually create a MongoDB document like:

// filename: "machine_learning.pdf"
// status: "processing"
// sizeBytes: 245678
// uploadedAt: 2026-09-27
// totalChunks: 0

// Why MongoDB stores this: MongoDB keeps track of the document's metadata and processing state. The actual PDF text/chunks and embeddings will be handled separately.

const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },

    filePath: {
        type: String,
        required: true
    },

    status: {
        type: String,
        enum: ["processing", "ready", "failed"],
        default: "processing"
    },

    sizeBytes: {
        type: Number,
        required: true
    },

    uploadedAt: {
        type: Date,
        default: Date.now
    },

    totalChunks: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model("Document", documentSchema);