const mongoose = require('mongoose');

const aiRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ['chat', 'image_analysis', 'code_generation', 'summarization', 'multimodal'],
        required: true,
    },
    model: {
        type: String,
        required: true,
    },
    input: {
        text: String,
        images: [String],
        documents: [String],
        code: String,
    },
    output: {
        text: String,
        code: String,
        summary: String,
        analysis: String,
    },
    tokens: {
        input: Number,
        output: Number,
        total: Number,
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
    },
    error: String,
    responseTime: Number,
    cost: Number,
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

// Index for analytics
aiRequestSchema.index({ userId: 1, type: 1, createdAt: -1 });
aiRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AIRequest', aiRequestSchema);