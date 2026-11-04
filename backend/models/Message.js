const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
    {
        chat: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", required: true, index: true },
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        text: { type: String, required: true, trim: true, maxlength: 2000 },
        readBy: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
            default: []
        }
    },
    { timestamps: true }
);

messageSchema.index({ chat: 1, _id: -1 });

module.exports = mongoose.models.Message || mongoose.model("Message", messageSchema);
