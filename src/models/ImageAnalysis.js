const mongoose = require('mongoose');

const imageAnalysisSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    file: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'File',
        required: true,
    },
    analysis: {
        description: String,
        objects: [{
            name: String,
            confidence: Number,
            attributes: mongoose.Schema.Types.Mixed,
        }],
        scenes: [String],
        textExtracted: String,
        colors: [String],
        tags: [String],
    },
    prompt: String,
    response: String,
    tokens: {
        input: Number,
        output: Number,
        total: Number,
    },
    processingTime: Number,
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model('ImageAnalysis', imageAnalysisSchema);