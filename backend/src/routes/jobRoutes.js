const express = require("express");

const { redisClient } = require("../config/redis");

const router = express.Router();


// GET /jobs/:jobId
router.get("/:jobId", async (req, res) => {

    try {

        const { jobId } = req.params;

        console.log(
            `Checking job status: ${jobId}`
        );


        // Get job information from Redis
        const job = await redisClient.hGetAll(
            `job:${jobId}`
        );


        // Job does not exist
        if (!job || Object.keys(job).length === 0) {

            return res.status(404).json({
                message: "Job not found"
            });
        }


        // Return job status
        res.status(200).json({
            jobId: job.jobId,
            documentId: job.documentId,
            status: job.status,
            stage: job.stage,
            progress: job.progress,
            error: job.error || null
        });

    } catch (error) {

        console.error(
            "Failed to get job status:",
            error.message
        );

        res.status(500).json({
            message: "Failed to get job status"
        });
    }
});


module.exports = router;