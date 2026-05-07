const mongoose = require('mongoose');

const codeGenerationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ['generation', 'debugging', 'explanation'],
        required: true,
    },
    language: {
        type: String,
        required: true,
    },
    title: String,
    prompt: {
        type: String,
        required: true,
    },
    originalCode: String, // For debugging/explanation
    generatedCode: String,
    explanation: String,
    debugResults: {
        issues: [String],
        fixes: [String],
        suggestions: [String],
    },
    tokens: {
        input: Number,
        output: Number,
        total: Number,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('CodeGeneration', codeGenerationSchema);