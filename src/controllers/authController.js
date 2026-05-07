const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { generateToken, generateRefreshToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return next(new AppError('User already exists with this email', 400));
        }

        // Create user
        const user = await User.create({
            name,
            email,
            password,
        });

        // Generate verification token
        const verificationToken = user.generateVerificationToken();
        await user.save({ validateBeforeSave: false });

        // Send verification email
        try {
            await emailService.sendVerificationEmail(user.email, verificationToken);
        } catch (error) {
            console.error('Email sending failed:', error);
            // Don't fail registration if email fails
        }

        // Generate JWT tokens
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // Log activity
        user.activityLog.push({
            action: 'register',
            details: 'User registered successfully',
        });
        user.lastLogin = new Date();
        await user.save();

        res.status(201).json({
            success: true,
            token,
            refreshToken,
            user: user.toJSON(),
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Check if email and password exist
        if (!email || !password) {
            return next(new AppError('Please provide email and password', 400));
        }

        // Find user and include password for comparison
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return next(new AppError('Invalid credentials', 401));
        }

        // Check password
        const isPasswordCorrect = await user.comparePassword(password);
        if (!isPasswordCorrect) {
            return next(new AppError('Invalid credentials', 401));
        }

        // Generate tokens
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        // Update last login
        user.lastLogin = new Date();
        user.activityLog.push({
            action: 'login',
            details: 'User logged in',
        });
        await user.save();

        res.status(200).json({
            success: true,
            token,
            refreshToken,
            user: user.toJSON(),
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Verify email
// @route   GET /api/auth/verify-email/:token
// @access  Public
exports.verifyEmail = async (req, res, next) => {
    try {
        const hashedToken = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        const user = await User.findOne({
            verificationToken: hashedToken,
            verificationTokenExpires: { $gt: Date.now() },
        });

        if (!user) {
            return next(new AppError('Invalid or expired verification token', 400));
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        user.activityLog.push({
            action: 'verify_email',
            details: 'Email verified successfully',
        });
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Email verified successfully',
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
    try {
        const user = await User.findOne({ email: req.body.email });

        if (!user) {
            return next(new AppError('No user found with that email', 404));
        }

        // Generate reset token
        const resetToken = user.generatePasswordResetToken();
        await user.save({ validateBeforeSave: false });

        // Send reset email
        try {
            await emailService.sendPasswordResetEmail(user.email, resetToken);
        } catch (error) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save({ validateBeforeSave: false });
            return next(new AppError('Error sending password reset email', 500));
        }

        res.status(200).json({
            success: true,
            message: 'Password reset email sent',
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password/:token
// @access  Public
exports.resetPassword = async (req, res, next) => {
    try {
        const hashedToken = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            return next(new AppError('Invalid or expired reset token', 400));
        }

        user.password = req.body.password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.activityLog.push({
            action: 'reset_password',
            details: 'Password reset successfully',
        });
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successful',
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Refresh token
// @route   POST /api/auth/refresh-token
// @access  Public
exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return next(new AppError('Refresh token is required', 400));
        }

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return next(new AppError('Invalid refresh token', 401));
        }

        // Generate new tokens
        const newToken = generateToken(user._id);
        const newRefreshToken = generateRefreshToken(user._id);

        res.status(200).json({
            success: true,
            token: newToken,
            refreshToken: newRefreshToken,
        });
    } catch (error) {
        return next(new AppError('Invalid or expired refresh token', 401));
    }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res, next) => {
    try {
        req.user.activityLog.push({
            action: 'logout',
            details: 'User logged out',
        });
        await req.user.save();

        res.status(200).json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        next(error);
    }
};