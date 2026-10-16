
const { redisClient } = require("../config/redis");
const Document = require("../models/Document");
const Chunk = require("../models/chunk");

const STALE_JOB_TIMEOUT_MS = 10 * 60 * 1000;

const cleanupStaleJobs = async () => {
    try {
        // Scan Redis incrementally for job records.
        for await (const keys of redisClient.scanIterator({
            MATCH: "job:*",
            COUNT: 100
        })) {
            for (const key of keys) {
                const job = await redisClient.hGetAll(key);

                if (
                    job.status !== "processing" &&
                    job.status !== "completing" &&
                    job.status !== "recovering"
                ) {
                    continue;
                }

                const lastActivity = Date.parse(
                    job.lastUpdatedAt || job.startedAt || ""
                );

                if (Number.isNaN(lastActivity)) {
                    continue;
                }

                if (
                    Date.now() - lastActivity <=
                    STALE_JOB_TIMEOUT_MS
                ) {
                    continue;
                }

                const now = new Date().toISOString();

                // Atomically claim the stale job only if its status
                // and last activity timestamp have not changed.
                const claimed = await redisClient.eval(
                    `
                    local status = redis.call("HGET", KEYS[1], "status")
                    local lastUpdated = redis.call("HGET", KEYS[1], "lastUpdatedAt")

                    if status ~= ARGV[1] then
                        return 0
                    end

                    if lastUpdated ~= ARGV[2] then
                        return 0
                    end

                    redis.call(
                        "HSET", KEYS[1],
                        "status", "recovering",
                        "stage", "recovery",
                        "lastUpdatedAt", ARGV[3]
                    )

                    return 1
                    `,
                    {
                        keys: [key],
                        arguments: [
                            job.status,
                            job.lastUpdatedAt || job.startedAt || "",
                            now
                        ]
                    }
                );

                if (Number(claimed) !== 1) {
                    continue;
                }

                console.warn(`Stale job claimed for recovery: ${key}`);

                if (!job.documentId) {
                    await redisClient.hSet(key, {
                        status: "failed",
                        stage: "error",
                        progress: "0",
                        error: "Job or document ID missing",
                        lastUpdatedAt: new Date().toISOString()
                    });

                    continue;
                }

                const document = await Document.findById(job.documentId);

                // If MongoDB already says ready, finish Redis finalization.
                if (document?.status === "ready") {
                    await redisClient.hSet(key, {
                        status: "completed",
                        stage: "completed",
                        progress: "100",
                        lastUpdatedAt: new Date().toISOString()
                    });

                    console.log(`Recovered completed job: ${key}`);
                    continue;
                }

                // Do not overwrite data belonging to an unexpected state.
                if (
                    document &&
                    document.status !== "processing" &&
                    document.status !== "failed"
                ) {
                    console.error(
                        `Cannot safely recover ${key}; ` +
                        `document status is ${document.status}`
                    );

                    await redisClient.hSet(key, {
                        status: "failed",
                        stage: "error",
                        progress: "0",
                        error: "Manual recovery required",
                        lastUpdatedAt: new Date().toISOString()
                    });

                    continue;
                }

                // Remove partial chunks and mark the document failed.
                await Chunk.deleteMany({
                    documentId: job.documentId
                });

                await Document.findByIdAndUpdate(
                    job.documentId,
                    {
                        status: "failed",
                        totalChunks: 0
                    }
                );

                await redisClient.hSet(key, {
                    status: "failed",
                    stage: "error",
                    progress: "0",
                    error: "Job timed out due to inactivity",
                    lastUpdatedAt: new Date().toISOString()
                });

                console.log(`Stale job cleaned up: ${key}`);
            }
        }
    } catch (error) {
        console.error(
            "Stale-job cleanup failed:",
            error.message
        );
    }
};

module.exports = cleanupStaleJobs;
