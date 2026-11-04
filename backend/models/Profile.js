const mongoose = require("mongoose");

const profileSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
        age: { type: Number, min: 18, max: 100, required: true },
        gender: { type: String, required: true, trim: true, maxlength: 40 },
        heightCm: { type: Number, min: 100, max: 250 },
        avatarUrl: { type: String, trim: true, maxlength: 500, default: "" },
        profileStatus: { type: String, enum: ["active", "paused"], default: "active", required: true },
        bio: { type: String, trim: true, maxlength: 500, default: "" },
        education: { type: String, trim: true, maxlength: 120, default: "" },
        profession: { type: String, trim: true, maxlength: 120, default: "" },
        interests: { type: [String], default: [] },
        lifestyle: {
            routine: { type: String, trim: true, maxlength: 300, default: "" },
            interests: { type: [String], default: [] }
        },
        family: {
            background: { type: String, trim: true, maxlength: 300, default: "" },
            involvement: { type: String, trim: true, maxlength: 300, default: "" }
        },
        preferences: {
            basic: { type: mongoose.Schema.Types.Mixed, default: {} },
            lifestyle: { type: mongoose.Schema.Types.Mixed, default: {} },
            family: { type: mongoose.Schema.Types.Mixed, default: {} },
            valuesOutlook: { type: mongoose.Schema.Types.Mixed, default: {} },
            additional: { type: mongoose.Schema.Types.Mixed, default: {} }
        }
    },
    { timestamps: true }
);

module.exports = mongoose.models.Profile || mongoose.model("Profile", profileSchema);
