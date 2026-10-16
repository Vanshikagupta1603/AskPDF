const { createClient } = require("redis");

const redisClient = createClient({
    url: process.env.REDIS_URL
});

redisClient.on("error", (error) => {
    console.error("Redis error:", error.message);
});

const connectRedis = async () => {
    try {
        await redisClient.connect();
        console.log("Redis connected successfully");
    } catch (error) {
        console.error("Redis connection failed:", error.message);
        process.exit(1);
    }
};

module.exports = {
    redisClient,
    connectRedis
};