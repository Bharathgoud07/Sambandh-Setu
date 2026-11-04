const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
    {
        connection: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Connection",
            required: true,
            unique: true,
            index: true
        },
        mutedBy: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
            default: []
        },
        lastMessageAt: { type: Date, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.models.Chat || mongoose.model("Chat", chatSchema);
