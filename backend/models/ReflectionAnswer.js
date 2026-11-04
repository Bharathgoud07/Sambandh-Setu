const mongoose = require("mongoose");

const reflectionAnswerSchema = new mongoose.Schema(
    {
        connection: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Connection",
            required: true,
            index: true
        },
        author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        question: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ReflectionQuestion",
            required: true
        },
        value: { type: mongoose.Schema.Types.Mixed, required: true },
        otherText: { type: String, trim: true, maxlength: 200 },
        sharing: {
            type: String,
            enum: ["keep_private", "share_with_match", "share_later"],
            default: "keep_private",
            required: true
        }
    },
    { timestamps: true }
);

reflectionAnswerSchema.index({ connection: 1, author: 1, question: 1 }, { unique: true });

module.exports =
    mongoose.models.ReflectionAnswer || mongoose.model("ReflectionAnswer", reflectionAnswerSchema);
