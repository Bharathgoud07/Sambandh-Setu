const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true, trim: true, lowercase: true },
        email: { type: String, required: true, unique: true, trim: true, lowercase: true, select: false },
        firstName: { type: String, required: true, trim: true, maxlength: 60 },
        lastName: { type: String, trim: true, maxlength: 60, default: "" },
        passwordHash: { type: String, required: true, select: false },
        isSeeded: { type: Boolean, default: false, select: false },
        sharingDefault: {
            type: String,
            enum: ["keep_private", "share_with_match", "share_later"],
            default: "keep_private",
            required: true
        },
        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
);

userSchema.methods.setPassword = async function (password) {
    if (typeof password !== "string" || password.length < 8) {
        throw new Error("Password must contain at least 8 characters");
    }
    this.passwordHash = await bcrypt.hash(password, 12);
};

userSchema.methods.comparePassword = function (password) {
    return bcrypt.compare(password, this.passwordHash);
};

userSchema.set("toJSON", {
    transform(document, result) {
        delete result.passwordHash;
        delete result.email;
        delete result.isSeeded;
        delete result.__v;
        return result;
    }
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
