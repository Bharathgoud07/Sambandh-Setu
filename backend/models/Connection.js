const mongoose = require("mongoose");

const JOURNEY_STAGES = [
    "connect",
    "understand",
    "reflect",
    "discuss",
    "agree",
    "family",
    "reflect_again",
    "decision",
    "complete"
];

const connectionSchema = new mongoose.Schema(
    {
        participants: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
            validate: {
                validator(participants) {
                    return participants.length === 2 && String(participants[0]) !== String(participants[1]);
                },
                message: "A connection must have two distinct users"
            }
        },
        pairKey: { type: String, required: true, unique: true },
        request: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ConnectionRequest",
            required: true,
            unique: true
        },
        status: { type: String, enum: ["active"], default: "active", required: true },
        stage: { type: String, enum: JOURNEY_STAGES, default: "connect", required: true }
    },
    { timestamps: true }
);

connectionSchema.index({ participants: 1, status: 1 });

const Connection = mongoose.models.Connection || mongoose.model("Connection", connectionSchema);
Connection.JOURNEY_STAGES = JOURNEY_STAGES;

module.exports = Connection;
