const mongoose = require('mongoose');

const summarySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    originalContent: {
        type: String,
        required: true,
    },
    shortSummary: String,
    bulletSummary: [String],
    keyPoints: [String],
    actionItems: [String],
    sourceType: {
        type: String,
        enum: ['text', 'pdf', 'url'],
        required: true,
    },
    sourceFile: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'File',
    },
    tokens: {
        input: Number,
        output: Number,
        total: Number,
    },
    wordCount: {
        original: Number,
        summary: Number,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('Summary', summarySchema);