const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        minlength: [2, 'Name must be at least 2 characters'],
        maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters'],
        select: false,
    },
    avatar: {
        type: String,
        default: 'default-avatar.png',
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    verificationToken: String,
    verificationTokenExpires: Date,
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    lastLogin: Date,
    preferences: {
        theme: {
            type: String,
            enum: ['light', 'dark'],
            default: 'dark',
        },
        notifications: {
            type: Boolean,
            default: true,
        },
    },
    stats: {
        totalChats: { type: Number, default: 0 },
        totalImages: { type: Number, default: 0 },
        totalCodeGenerations: { type: Number, default: 0 },
        totalSummaries: { type: Number, default: 0 },
        tokensUsed: { type: Number, default: 0 },
    },
    activityLog: [{
        action: String,
        details: String,
        timestamp: {
            type: Date,
            default: Date.now,
        },
    }],
    createdAt: {
        type: Date,
        default: Date.now,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Update timestamps
userSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Generate verification token
userSchema.methods.generateVerificationToken = function() {
    const token = crypto.randomBytes(32).toString('hex');
    this.verificationToken = crypto.createHash('sha256').update(token).digest('hex');
    this.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
    const token = crypto.randomBytes(32).toString('hex');
    this.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    this.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    return token;
};

// Remove sensitive fields from JSON
userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.verificationToken;
    delete obj.verificationTokenExpires;
    delete obj.resetPasswordToken;
    delete obj.resetPasswordExpires;
    delete obj.__v;
    return obj;
};

module.exports = mongoose.model('User', userSchema);