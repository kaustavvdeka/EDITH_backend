const User = require('../models/User');
const Chat = require('../models/Chat');
const ImageAnalysis = require('../models/ImageAnalysis');
const CodeGeneration = require('../models/CodeGeneration');
const Summary = require('../models/Summary');
const AIRequest = require('../models/AIRequest');
const { AppError } = require('../middleware/errorHandler');

// @desc    Get user profile
// @route   GET /api/user/profile
// @access  Private
exports.getProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return next(new AppError('User not found', 404));
        }

        res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update user profile
// @route   PUT /api/user/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
    try {
        const { name, preferences } = req.body;

        const updateFields = {};
        if (name) updateFields.name = name;
        if (preferences) updateFields.preferences = preferences;
        if (req.file) {
            updateFields.avatar = req.file.path; // This will be the Cloudinary URL
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            updateFields,
            { new: true, runValidators: true }
        );

        if (!user) {
            return next(new AppError('User not found', 404));
        }

        user.activityLog.push({
            action: 'update_profile',
            details: 'Profile updated',
        });
        await user.save();

        res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Change password
// @route   PUT /api/user/change-password
// @access  Private
exports.changePassword = async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Get user with password
        const user = await User.findById(req.user.id).select('+password');

        // Check current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return next(new AppError('Current password is incorrect', 401));
        }

        // Update password
        user.password = newPassword;
        user.activityLog.push({
            action: 'change_password',
            details: 'Password changed',
        });
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password updated successfully',
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get user dashboard stats
// @route   GET /api/user/dashboard
// @access  Private
exports.getDashboard = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Get counts from all collections
        const [
            totalChats,
            totalImages,
            totalCodeGenerations,
            totalSummaries,
            recentChats,
            recentAnalyses,
            recentCodeGens,
            recentSummaries,
            totalTokens,
        ] = await Promise.all([
            Chat.countDocuments({ userId }),
            ImageAnalysis.countDocuments({ userId }),
            CodeGeneration.countDocuments({ userId }),
            Summary.countDocuments({ userId }),
            Chat.find({ userId })
                .sort({ lastMessageAt: -1 })
                .limit(5)
                .select('title lastMessageAt totalTokens'),
            ImageAnalysis.find({ userId })
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('file', 'originalName'),
            CodeGeneration.find({ userId })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('title language type createdAt'),
            Summary.find({ userId })
                .sort({ createdAt: -1 })
                .limit(5)
                .select('title sourceType wordCount createdAt'),
            AIRequest.aggregate([
                { $match: { userId: new (require('mongoose').Types.ObjectId)(userId) } },
                { $group: { _id: null, total: { $sum: '$tokens.total' } } },
            ]),
        ]);

        // Get monthly usage stats
        const monthlyStats = await AIRequest.aggregate([
            {
                $match: {
                    userId: new (require('mongoose').Types.ObjectId)(userId),
                    createdAt: {
                        $gte: new Date(new Date().setMonth(new Date().getMonth() - 6)),
                    },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                    },
                    totalRequests: { $sum: 1 },
                    totalTokens: { $sum: '$tokens.total' },
                    avgResponseTime: { $avg: '$responseTime' },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);

        // Get usage by type
        const usageByType = await AIRequest.aggregate([
            {
                $match: {
                    userId: new (require('mongoose').Types.ObjectId)(userId),
                },
            },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    totalTokens: { $sum: '$tokens.total' },
                },
            },
        ]);

        res.status(200).json({
            success: true,
            stats: {
                totals: {
                    chats: totalChats,
                    images: totalImages,
                    codeGenerations: totalCodeGenerations,
                    summaries: totalSummaries,
                    tokensUsed: totalTokens[0]?.total || 0,
                },
                recent: {
                    chats: recentChats,
                    analyses: recentAnalyses,
                    codeGenerations: recentCodeGens,
                    summaries: recentSummaries,
                },
                monthly: monthlyStats,
                usageByType,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get user activity log
// @route   GET /api/user/activity
// @access  Private
exports.getActivityLog = async (req, res, next) => {
    try {
        const { page = 1, limit = 20 } = req.query;

        const user = await User.findById(req.user.id)
            .select('activityLog')
            .slice('activityLog', [(page - 1) * limit, limit]);

        const total = user.activityLog.length;

        res.status(200).json({
            success: true,
            activities: user.activityLog.slice((page - 1) * limit, page * limit),
            pagination: {
                page: parseInt(page),
                pages: Math.ceil(total / limit),
                total,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete user account
// @route   DELETE /api/user/account
// @access  Private
exports.deleteAccount = async (req, res, next) => {
    try {
        const userId = req.user.id;

        // Delete all user data
        await Promise.all([
            User.findByIdAndDelete(userId),
            Chat.deleteMany({ userId }),
            ImageAnalysis.deleteMany({ userId }),
            CodeGeneration.deleteMany({ userId }),
            Summary.deleteMany({ userId }),
            AIRequest.deleteMany({ userId }),
            require('../models/File').deleteMany({ userId }),
        ]);

        res.status(200).json({
            success: true,
            message: 'Account deleted successfully',
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Admin - Get all users
// @route   GET /api/user/admin/users
// @access  Private/Admin
exports.getAllUsers = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;

        const query = {};
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
            ];
        }

        const users = await User.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('-activityLog');

        const total = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            users,
            pagination: {
                page: parseInt(page),
                pages: Math.ceil(total / limit),
                total,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Admin - Get user stats
// @route   GET /api/user/admin/stats
// @access  Private/Admin
exports.getAdminStats = async (req, res, next) => {
    try {
        const [
            totalUsers,
            totalChats,
            totalCodeGenerations,
            totalSummaries,
            totalImageAnalyses,
            totalTokens,
            newUsersToday,
            requestsToday,
        ] = await Promise.all([
            User.countDocuments(),
            Chat.countDocuments(),
            CodeGeneration.countDocuments(),
            Summary.countDocuments(),
            ImageAnalysis.countDocuments(),
            AIRequest.aggregate([
                { $group: { _id: null, total: { $sum: '$tokens.total' } } },
            ]),
            User.countDocuments({
                createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            }),
            AIRequest.countDocuments({
                createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            }),
        ]);

        res.status(200).json({
            success: true,
            stats: {
                totalUsers,
                totalChats,
                totalCodeGenerations,
                totalSummaries,
                totalImageAnalyses,
                totalTokensUsed: totalTokens[0]?.total || 0,
                newUsersToday,
                requestsToday,
            },
        });
    } catch (error) {
        next(error);
    }
};