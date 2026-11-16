const mongoose = require("mongoose");

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 15000
        });

        console.log("MongoDB connected successfully");
    } catch (error) {
        // Driver messages can embed connection details; log the type only.
        console.error(
            "MongoDB connection failed: name=%s code=%s",
            error.name || "Error",
            error.code || "none"
        );
        throw error;
    }
};

module.exports = connectDB;