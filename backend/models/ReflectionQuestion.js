const mongoose = require("mongoose");

const reflectionQuestionSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, trim: true },
        order: { type: Number, required: true, min: 1, max: 10 },
        category: { type: String, required: true, trim: true, maxlength: 80 },
        prompt: { type: String, required: true, trim: true, maxlength: 500 },
        type: {
            type: String,
            enum: ["single_select", "multi_select", "rating", "free_text"],
            required: true
        },
        options: {
            type: [
                new mongoose.Schema(
                    {
                        value: { type: String, required: true, maxlength: 100 },
                        label: { type: String, required: true, maxlength: 120 }
                    },
                    { _id: false }
                )
            ],
            default: []
        },
        minSelections: { type: Number, min: 0 },
        maxSelections: { type: Number, min: 1 },
        allowOther: { type: Boolean, default: false },
        otherTextMaxLength: { type: Number, min: 1, max: 200, default: 100 },
        minRating: { type: Number, min: 1, max: 5, default: 1 },
        maxRating: { type: Number, min: 1, max: 5, default: 5 },
        maxLength: { type: Number, min: 1, max: 500, default: 500 },
        isMock: { type: Boolean, default: true, required: true }
    },
    { timestamps: true }
);

reflectionQuestionSchema.index({ order: 1 }, { unique: true });

module.exports =
    mongoose.models.ReflectionQuestion ||
    mongoose.model("ReflectionQuestion", reflectionQuestionSchema);
