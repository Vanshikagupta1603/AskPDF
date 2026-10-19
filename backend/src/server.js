
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");

const documentRoutes = require("./routes/documentRoutes");
const chatRoutes = require("./routes/chatRoutes");
const jobRoutes = require("./routes/jobRoutes");
const cleanupStaleJobs = require("./services/staleJobCleanup");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 5000;

// Log HTTP request details when each response finishes.
app.use((req, res, next) => {
    const startTime = Date.now();

    res.on("finish", () => {
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs: Date.now() - startTime
        }));
    });

    next();
});

// General API rate limit: 100 requests per 15 minutes.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        message: "Too many requests. Please try again later."
    }
});

// Register common middleware before the API routes.
app.use(cors());
app.use(express.json());

// Health-check endpoint.
app.get("/", (req, res) => {
    res.send("AskPDF API Running");
});

// Apply rate limiting to each API route group.
app.use("/jobs", apiLimiter, jobRoutes);
app.use("/chat", apiLimiter, chatRoutes);
app.use("/documents", apiLimiter, documentRoutes);

// Connect services before accepting requests.
const startServer = async () => {
    try {
        await connectDB();
        await connectRedis();

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

        // Check for stale jobs every 60 seconds.
        setInterval(() => {
            cleanupStaleJobs();
        }, 60 * 1000);

        console.log("Stale-job cleanup scheduled");
    } catch (error) {
        console.error(
            "Server startup failed:",
            error.message
        );

        process.exit(1);
    }
};

startServer();
