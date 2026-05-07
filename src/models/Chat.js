const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'assistant', 'system'],
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
    metadata: {
        tokens: Number,
        model: String,
        responseTime: Number,
    },
});

const chatSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    title: {
        type: String,
        default: 'New Chat',
        trim: true,
        maxlength: 100,
    },
    messages: [messageSchema],
    tags: [{
        type: String,
        trim: true,
    }],
    isArchived: {
        type: Boolean,
        default: false,
    },
    summary: String,
    totalTokens: {
        type: Number,
        default: 0,
    },
    lastMessageAt: {
        type: Date,
        default: Date.now,
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

// Index for efficient querying
chatSchema.index({ userId: 1, lastMessageAt: -1 });
chatSchema.index({ userId: 1, isArchived: 1 });

// Update timestamps before save
chatSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    if (this.messages.length > 0) {
        this.lastMessageAt = this.messages[this.messages.length - 1].timestamp;
    }
    next();
});

// Method to add message
chatSchema.methods.addMessage = async function(role, content, metadata = {}) {
    this.messages.push({
        role,
        content,
        metadata,
        timestamp: new Date(),
    });
    
    if (metadata.tokens) {
        this.totalTokens += metadata.tokens;
    }
    
    return await this.save();
};

// Static method to get user's recent chats
chatSchema.statics.getRecentChats = function(userId, limit = 10) {
    return this.find({ userId, isArchived: false })
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .select('title lastMessageAt totalTokens messages');
};

module.exports = mongoose.model('Chat', chatSchema);