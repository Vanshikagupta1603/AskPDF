const mongoose = require("mongoose");

const chunkSchema = new mongoose.Schema({
    documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Document",
        required: true
    },

    chunkIndex: {
        type: Number,
        required: true
    },

    text: {
        type: String,
        required: true
    },

    pageNumber: {
        type: Number,
        default: null
    },

    embedding: {
        type: [Number],
        default: []
    }
});

module.exports = mongoose.model("Chunk", chunkSchema);