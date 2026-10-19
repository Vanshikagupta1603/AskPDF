
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, "../../.env")
});

const { createClient } = require("redis");
const fs = require("fs");
const { PDFParse } = require("pdf-parse");

const STALE_JOB_TIMEOUT_MS = 10 * 60 * 1000;

const connectDB = require("../config/db");
const Document = require("../models/Document");
const Chunk = require("../models/chunk");
const chunkText = require("../services/chunkService");
const generateEmbedding = require("../services/geminiServices");

console.log(
    "Worker Gemini API key loaded:",
    process.env.GEMINI_API_KEY ? "YES" : "NO"
);

const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on("error", (error) => {
    console.error("Worker Redis error:", error);
});

// --------------------------------------------------
// Helper: Mark a failed job and remove partial chunks
// --------------------------------------------------

const markJobAsFailed = async (jobId, documentId, error) => {
    try {
        const currentJob = await redisClient.hGetAll(`job:${jobId}`);

        // Cleanup has already claimed this job as stale.
        if (
            currentJob.status === "failed" &&
            currentJob.error === "Job timed out due to inactivity"
        ) {
            console.log(
                `Job ${jobId} was already marked stale; ` +
                "skipping duplicate failure handling"
            );
            return;
        }

        // Never overwrite a completed job.
        if (currentJob.status === "completed") {
            console.log(
                `Job ${jobId} is already completed; ` +
                "skipping failure handling"
            );
            return;
        }

        
        // Do not interfere with a job being recovered by cleanup.
        if (
            currentJob.status === "recovering" ||
            currentJob.status === "completing"
        ) {
            console.log(
                `Job ${jobId} is being recovered or finalized; ` +
                "skipping failure handling"
            );
            return;
        }


        // Do not delete data after completion has been claimed.
        // The cleanup service must recover this state if the worker crashes.
        if (currentJob.status === "completing") {
            console.error(
                `Job ${jobId} is completing; preserving document data`
            );
            return;
        }

        if (documentId) {
            const deletedChunks = await Chunk.deleteMany({
                documentId
            });

            console.log(
                `Deleted ${deletedChunks.deletedCount} partial chunks`
            );

            await Document.findByIdAndUpdate(documentId, {
                status: "failed",
                totalChunks: 0
            });
        }

        await redisClient.hSet(`job:${jobId}`, {
            status: "failed",
            stage: "error",
            progress: "0",
            error: error.message,
            lastUpdatedAt: new Date().toISOString()
        });

        console.log(`Job ${jobId} marked as failed`);
    } catch (updateError) {
        console.error(
            "Failed to update failure status:",
            updateError.message
        );
    }
};

// --------------------------------------------------
// Helper: Detect stale processing jobs
// --------------------------------------------------

const isJobStale = (job) => {
    if (job.status !== "processing") {
        return false;
    }

    const lastActivity = Date.parse(
        job.lastUpdatedAt || job.startedAt || ""
    );

    if (Number.isNaN(lastActivity)) {
        return false;
    }

    return Date.now() - lastActivity > STALE_JOB_TIMEOUT_MS;
};

// --------------------------------------------------
// Helper: Recover a stale job
// --------------------------------------------------

const recoverStaleJob = async (jobId) => {
    const job = await redisClient.hGetAll(`job:${jobId}`);

    if (!job || Object.keys(job).length === 0) {
        return;
    }

    if (!isJobStale(job)) {
        return;
    }

    console.warn(`Job ${jobId} is stale. Marking it as failed.`);

    await markJobAsFailed(
        jobId,
        job.documentId,
        new Error("Job timed out due to inactivity")
    );
};

// --------------------------------------------------
// Start Worker
// --------------------------------------------------

const startWorker = async () => {
    try {
        await connectDB();
        await redisClient.connect();

        console.log("PDF Worker started");
        console.log("Waiting for PDF processing jobs...");

        while (true) {
            const result = await redisClient.brPop(
                "jobs:pdf-processing",
                0
            );

            const jobId = result.element;

            console.log(`Received job: ${jobId}`);

            let job;
            let heartbeat;

            try {
                job = await redisClient.hGetAll(`job:${jobId}`);

                console.log("Job details:", job);

                // Validate the job record.
                if (!job || !job.documentId) {
                    await redisClient.hSet(`job:${jobId}`, {
                        status: "failed",
                        stage: "error",
                        progress: "0",
                        error: "Job or document ID missing",
                        lastUpdatedAt: new Date().toISOString()
                    });

                    continue;
                }

                // Do not process terminal jobs again.
                if (
                    job.status === "completed" ||
                    job.status === "failed" ||
                    job.status === "recovering"
                ) {
                    console.log(
                        `Skipping terminal job ${jobId}: ${job.status}`
                    );
                    continue;
                }

                // A completing job must be recovered, not restarted
                // as a fresh processing job.
                if (job.status === "completing") {
                    console.warn(
                        `Job ${jobId} is awaiting completion recovery`
                    );
                    continue;
                }

                const document = await Document.findById(job.documentId);

                if (!document) {
                    console.error(
                        `Document not found: ${job.documentId}`
                    );

                    await redisClient.hSet(`job:${jobId}`, {
                        status: "failed",
                        stage: "error",
                        progress: "0",
                        error: "Document not found",
                        lastUpdatedAt: new Date().toISOString()
                    });

                    continue;
                }

                // Stage 1: Start processing.
                const startedAt = new Date().toISOString();

                await redisClient.hSet(`job:${jobId}`, {
                    status: "processing",
                    stage: "starting",
                    progress: "0",
                    startedAt,
                    lastUpdatedAt: startedAt
                });

                console.log(
                    `Processing document: ${document.filename}`
                );

                // Refresh the activity timestamp every 30 seconds.
                heartbeat = setInterval(async () => {
                    try {
                        const currentJob = await redisClient.hGetAll(
                            `job:${jobId}`
                        );

                        if (currentJob.status !== "processing") {
                            return;
                        }

                        await redisClient.hSet(`job:${jobId}`, {
                            lastUpdatedAt: new Date().toISOString()
                        });
                    } catch (heartbeatError) {
                        console.error(
                            `Heartbeat failed for job ${jobId}:`,
                            heartbeatError.message
                        );
                    }
                }, 30 * 1000);

                // Stage 2: Extract PDF text.
                const pdfPath = path.join(__dirname, "../../uploads", document.filename);
                const pdfBuffer = fs.readFileSync(pdfPath);

                const parser = new PDFParse({
                    data: pdfBuffer
                });

                let pdfData;

                try {
                    pdfData = await parser.getText();
                } finally {
                    await parser.destroy();
                }

                const extractedText = pdfData.text;

                console.log("PDF text extracted successfully");
                console.log("Number of pages:", pdfData.total);
                console.log("Extracted text length:", extractedText.length);

                if (!extractedText || !extractedText.trim()) {
                    throw new Error("No extractable text found in PDF");
                }

                // Stage 3: Split the extracted text into chunks.
                const chunks = chunkText(extractedText);

                console.log("Text chunked successfully");
                console.log("Number of chunks:", chunks.length);

                if (chunks.length === 0) {
                    throw new Error("No text chunks were generated");
                }

                // Stage 4: Save chunks in MongoDB.
                const chunkDocuments = chunks.map((chunk, index) => ({
                    documentId: document._id,
                    chunkIndex: index,
                    text: chunk
                }));

                await Chunk.insertMany(chunkDocuments);

                console.log("Chunks saved to MongoDB");

                await Document.findByIdAndUpdate(document._id, {
                    totalChunks: chunks.length
                });

                await redisClient.hSet(`job:${jobId}`, {
                    status: "processing",
                    stage: "chunks_saved",
                    progress: "50",
                    lastUpdatedAt: new Date().toISOString()
                });

                // Stage 5: Generate and store embeddings.
                console.log("Generating embeddings...");

                for (let i = 0; i < chunkDocuments.length; i++) {
                    const chunk = chunkDocuments[i];

                    console.log(
                        `Generating embedding ${i + 1}/` +
                        `${chunkDocuments.length}`
                    );

                    const embedding = await generateEmbedding(chunk.text);

                    // Stop if another process has changed the job state.
                    const currentJob = await redisClient.hGetAll(
                        `job:${jobId}`
                    );

                    if (currentJob.status !== "processing") {
                        throw new Error(
                            "Job stopped because it is no longer processing"
                        );
                    }

                    await Chunk.updateOne(
                        {
                            documentId: document._id,
                            chunkIndex: chunk.chunkIndex
                        },
                        {
                            $set: {
                                embedding
                            }
                        }
                    );

                    await redisClient.hSet(`job:${jobId}`, {
                        lastUpdatedAt: new Date().toISOString()
                    });
                }

                console.log("All embeddings generated and stored");

                // --------------------------------------------------
                // Stage 6: Atomically claim completion in Redis.
                // Only one process can change processing -> completing.
                // --------------------------------------------------

                const claimed = await redisClient.eval(
                    `
                    if redis.call("HGET", KEYS[1], "status") ~= "processing" then
                        return 0
                    end

                    redis.call(
                        "HSET", KEYS[1],
                        "status", "completing",
                        "stage", "finalizing",
                        "lastUpdatedAt", ARGV[1]
                    )

                    return 1
                    `,
                    {
                        keys: [`job:${jobId}`],
                        arguments: [new Date().toISOString()]
                    }
                );

                if (Number(claimed) !== 1) {
                    throw new Error(
                        "Job could not claim completion because its status changed"
                    );
                }

                
                // Update only if the document is still processing.
                // This prevents stale-job recovery from being overwritten.
                const readyDocument = await Document.findOneAndUpdate(
                    {
                        _id: document._id,
                        status: "processing"
                    },
                    {
                        $set: {
                            status: "ready"
                        }
                    },
                    {
                        new: true
                    }
                );

                if (!readyDocument) {
                    throw new Error(
                        "Document status changed before completion"
                    );
                }


                // Finalize the Redis job only if it is still completing.
                const completed = await redisClient.eval(
                    `
                    if redis.call("HGET", KEYS[1], "status") ~= "completing" then
                        return 0
                    end

                    redis.call(
                        "HSET", KEYS[1],
                        "status", "completed",
                        "stage", "completed",
                        "progress", "100",
                        "lastUpdatedAt", ARGV[1]
                    )

                    return 1
                    `,
                    {
                        keys: [`job:${jobId}`],
                        arguments: [new Date().toISOString()]
                    }
                );

                if (Number(completed) !== 1) {
                    throw new Error(
                        "Document was marked ready, but Redis completion could not be finalized"
                    );
                }

                console.log(
                    "Document processing completed successfully"
                );
            } catch (error) {
                console.error(
                    `Job ${jobId} failed:`,
                    error.message
                );

                await markJobAsFailed(
                    jobId,
                    job?.documentId,
                    error
                );
            } finally {
                if (heartbeat) {
                    clearInterval(heartbeat);
                }
            }
        }
    } catch (error) {
        console.error("Worker failed:", error);
    }
};

startWorker();
