const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    filename: {
        type: String,
        required: true,
    },
    originalName: {
        type: String,
        required: true,
    },
    mimeType: {
        type: String,
        required: true,
    },
    size: {
        type: Number,
        required: true,
    },
    path: {
        type: String,
        required: true,
    },
    type: {
        type: String,
        enum: ['image', 'document', 'other'],
        required: true,
    },
    processedBy: {
        type: String,
        enum: ['vision', 'multimodal', 'summarizer', 'none'],
        default: 'none',
    },
    metadata: {
        width: Number,
        height: Number,
        pages: Number,
        textContent: String,
        aiDescription: String,
        aiTags: [String],
    },
    aiResponse: {
        analysis: String,
        extractedText: String,
        summary: String,
        objects: [{
            name: String,
            confidence: Number,
            boundingBox: {
                x: Number,
                y: Number,
                width: Number,
                height: Number,
            },
        }],
    },
    isPublic: {
        type: Boolean,
        default: false,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Update timestamps
fileSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('File', fileSchema);