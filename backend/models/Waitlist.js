
const mongoose = require("mongoose");

const waitlistSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 254
        },
        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 80
        },
        city: {
            type: String,
            trim: true,
            maxlength: 80,
            default: ""
        },
        consent: {
            type: Boolean,
            required: true,
            validate: {
                validator: (value) => value === true,
                message: "Consent must be true"
            }
        }
    },
{
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
}
);

waitlistSchema.index({ email: 1 }, { unique: true });

module.exports =
    mongoose.models.Waitlist ||
    mongoose.model("Waitlist", waitlistSchema, "waitlist");
