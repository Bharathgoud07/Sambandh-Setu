const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        type: {
            type: String,
            enum: [
                "connection_request",
                "connection_request_withdrawn",
                "connection_accepted",
                "connection_declined"
            ],
            required: true
        },
        request: { type: mongoose.Schema.Types.ObjectId, ref: "ConnectionRequest" },
        connection: { type: mongoose.Schema.Types.ObjectId, ref: "Connection" },
        readAt: { type: Date, default: null }
    },
    { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
