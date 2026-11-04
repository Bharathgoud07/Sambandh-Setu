const mongoose = require("mongoose");

const connectionRequestSchema = new mongoose.Schema(
    {
        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        pairKey: { type: String, required: true },
        status: {
            type: String,
            enum: ["pending", "accepted", "declined", "withdrawn"],
            default: "pending",
            required: true
        }
    },
    { timestamps: true }
);

connectionRequestSchema.index(
    { pairKey: 1 },
    { unique: true, partialFilterExpression: { status: "pending" } }
);

module.exports =
    mongoose.models.ConnectionRequest || mongoose.model("ConnectionRequest", connectionRequestSchema);
