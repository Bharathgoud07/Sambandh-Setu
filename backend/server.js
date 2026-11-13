const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const profileRoutes = require("./routes/profileRoutes");
const discoverRoutes = require("./routes/discoverRoutes");
const requestRoutes = require("./routes/requestRoutes");
const connectionRoutes = require("./routes/connectionRoutes");
const homeRoutes = require("./routes/homeRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const chatRoutes = require("./routes/chatRoutes");
const { notFoundHandler, errorHandler } = require("./middleware/errorMiddleware");
const ApiError = require("./utils/ApiError");
const mongoose = require("mongoose");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => {
    res.json({ message: "Sambandh Setu Backend is running!" });
});

app.get("/health/live", (req, res) => {
    res.json({ data: { status: "ok" } });
});

const readinessHandler = (req, res) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            error: {
                code: "NOT_READY",
                message: "Database connection is not ready",
                details: []
            }
        });
    }
    return res.json({ data: { status: "ready" } });
};

// `/health` is the single path the hosting platform probes (D2-21). It is an
// alias of `/health/ready` so the check fails when MongoDB is unavailable.
app.get("/health", readinessHandler);
app.get("/health/ready", readinessHandler);

app.use("/auth", authRoutes);
app.use("/me", userRoutes);
app.use("/profiles", profileRoutes);
app.use("/discover", discoverRoutes);
app.use("/requests", requestRoutes);
app.use("/connections", connectionRoutes);
app.use("/home", homeRoutes);
app.use("/notifications", notificationRoutes);
app.use("/chats", chatRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error("JWT_SECRET must be configured with at least 32 characters");
    }

    await connectDB();

    let server;
    try {
        server = await new Promise((resolve, reject) => {
            const listener = app.listen(PORT);
            listener.once("listening", () => resolve(listener));
            listener.once("error", reject);
        });
    } catch (error) {
        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            console.error("MongoDB disconnect after startup failure failed:", disconnectError.message);
        }
        throw error;
    }
    console.log(`Server running on port ${PORT}`);
    return server;
};

if (require.main === module) {
    startServer()
        .then((server) => {
            let shuttingDown = false;
            const shutdown = async (signal) => {
                if (shuttingDown) {
                    return;
                }
                shuttingDown = true;
                console.log(`${signal} received; shutting down`);
                server.close(async (error) => {
                    if (error) {
                        console.error("HTTP server shutdown failed:", error.message);
                        process.exitCode = 1;
                    }
                    try {
                        await mongoose.disconnect();
                    } catch (disconnectError) {
                        console.error("MongoDB shutdown failed:", disconnectError.message);
                        process.exitCode = 1;
                    }
                });
            };
            process.on("SIGINT", () => shutdown("SIGINT"));
            process.on("SIGTERM", () => shutdown("SIGTERM"));
        })
        .catch((error) => {
            console.error("Server startup failed:", error.message);
            process.exitCode = 1;
        });
}

module.exports = { app, startServer };