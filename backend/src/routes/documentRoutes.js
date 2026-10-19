// What this does

// When we send:

// POST /documents

// with a PDF file, Multer:

// Receives the PDF.
// Checks that it is a .pdf.
// Saves it inside:
// backend/uploads/
// Generates a unique filename such as:
// 1758951234567-machine-learning.pdf
// Returns a response containing the filename and file size.

const express = require("express");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");

const Document = require("../models/Document");
const { redisClient } = require("../config/redis");

const router = express.Router();

// Maximum allowed PDF size: 20 MiB
const MAX_FILE_SIZE = 20 * 1024 * 1024;
// Ensure the upload directory exists before Multer saves a PDF.
const uploadDir = path.join(__dirname, "../../uploads");
fs.mkdirSync(uploadDir, { recursive: true });

// Store uploaded PDFs in backend/uploads/
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
    cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const uniqueName =
            Date.now() + "-" + crypto.randomUUID() +
            path.extname(file.originalname).toLowerCase();

        cb(null, uniqueName);
    }
});

// Configure Multer
const upload = multer({
    storage,

    limits: {
        fileSize: MAX_FILE_SIZE
    },

    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();

        if (extension !== ".pdf") {
            return cb(new Error("Only PDF files are allowed"));
        }

        cb(null, true);
    }
});

// Handle the upload before running the route handler
router.post("/", (req, res, next) => {
    upload.single("file")(req, res, (error) => {
        if (error instanceof multer.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({
                    message: "PDF file exceeds the 20 MB upload limit"
                });
            }

            return res.status(400).json({
                message: error.message
            });
        }

        if (error) {
            return res.status(400).json({
                message: error.message
            });
        }

        next();
    });
}, async (req, res) => {
    let document = null;
    let jobKey = null;
    let jobQueued = false;

    try {
        if (!req.file) {
            return res.status(400).json({
                message: "Please upload a PDF file"
            });
        }

        console.log("Upload directory:", uploadDir);
        console.log("Uploaded file path:", req.file.path);
        console.log("Uploaded file exists:", fs.existsSync(req.file.path));

        // Create the document record in MongoDB
        document = await Document.create({
            filename: req.file.filename,
            filePath: req.file.path,
            sizeBytes: req.file.size,
            status: "processing"
        });

        const jobId = crypto.randomUUID();
        jobKey = `job:${jobId}`;

        // Create the job record in Redis
        await redisClient.hSet(jobKey, {
            jobId,
            documentId: document._id.toString(),
            status: "queued",
            stage: "waiting",
            progress: "0",
            lastUpdatedAt: new Date().toISOString()
        });

        // Add the job to the worker queue
        await redisClient.rPush("jobs:pdf-processing", jobId);
        jobQueued = true;

        return res.status(202).json({
            message: "PDF uploaded successfully",
            documentId: document._id,
            jobId,
            filename: document.filename,
            sizeBytes: document.sizeBytes,
            status: "processing"
        });

    } catch (error) {
        console.error(
            "Document processing setup failed:",
            error.message
        );

        // Best-effort cleanup if setup fails before queueing
        if (!jobQueued) {
            if (jobKey) {
                try {
                    await redisClient.del(jobKey);
                } catch (cleanupError) {
                    console.error(
                        "Redis job cleanup failed:",
                        cleanupError.message
                    );
                }
            }

            if (document) {
                try {
                    await Document.findByIdAndDelete(document._id);
                } catch (cleanupError) {
                    console.error(
                        "MongoDB document cleanup failed:",
                        cleanupError.message
                    );
                }
            }

            if (req.file?.path) {
                try {
                    await fsp.unlink(req.file.path);
                } catch (cleanupError) {
                    if (cleanupError.code !== "ENOENT") {
                        console.error(
                            "Uploaded file cleanup failed:",
                            cleanupError.message
                        );
                    }
                }
            }
        }

        return res.status(500).json({
            message: "Failed to create PDF processing job"
        });
    }
});

module.exports = router;
