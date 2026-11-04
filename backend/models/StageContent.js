const mongoose = require("mongoose");

const stageContentSchema = new mongoose.Schema(
    {
        stage: {
            type: String,
            enum: [
                "connect",
                "understand",
                "reflect",
                "discuss",
                "agree",
                "family",
                "reflect_again",
                "decision"
            ],
            required: true,
            unique: true
        },
        guidance: { type: [String], required: true },
        forYou: {
            type: [
                new mongoose.Schema(
                    {
                        title: { type: String, required: true, maxlength: 120 },
                        description: { type: String, required: true, maxlength: 500 }
                    },
                    { _id: false }
                )
            ],
            default: []
        },
        activities: { type: [String], default: [] },
        resources: { type: [String], default: [] },
        isMock: { type: Boolean, default: true, required: true }
    },
    { timestamps: true }
);

module.exports = mongoose.models.StageContent || mongoose.model("StageContent", stageContentSchema);
