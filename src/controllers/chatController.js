const Chat = require('../models/Chat');
const AIRequest = require('../models/AIRequest');
const User = require('../models/User');
const geminiService = require('../services/geminiService');
const { AppError } = require('../middleware/errorHandler');

// @desc    Create new chat
// @route   POST /api/chat/new
// @access  Private
exports.createChat = async (req, res, next) => {
    try {
        const { title } = req.body;

        const chat = await Chat.create({
            userId: req.user.id,
            title: title || 'New Chat',
        });

        // Update user stats
        await User.findByIdAndUpdate(req.user.id, {
            $inc: { 'stats.totalChats': 1 },
        });

        res.status(201).json({
            success: true,
            chat,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Send message and get AI response
// @route   POST /api/chat/:chatId/message
// @access  Private
exports.sendMessage = async (req, res, next) => {
    try {
        const { message } = req.body;
        const { chatId } = req.params;

        // Find chat
        let chat = await Chat.findOne({
            _id: chatId,
            userId: req.user.id,
        });

        if (!chat) {
            return next(new AppError('Chat not found', 404));
        }

        // Add user message
        await chat.addMessage('user', message);

        // Prepare chat history for Gemini
        const chatHistory = chat.messages.slice(0, -1).map(msg => ({
            role: msg.role,
            content: msg.content,
        }));

        // Get AI response
        const aiResponse = await geminiService.generateTextResponse(
            message,
            chatHistory
        );

        // Add AI response to chat
        await chat.addMessage('assistant', aiResponse.text, {
            tokens: aiResponse.tokens.total,
            model: aiResponse.model,
            responseTime: aiResponse.responseTime,
        });

        // Log AI request
        await AIRequest.create({
            userId: req.user.id,
            type: 'chat',
            model: aiResponse.model,
            input: { text: message },
            output: { text: aiResponse.text },
            tokens: aiResponse.tokens,
            status: 'completed',
            responseTime: aiResponse.responseTime,
        });

        // Update user stats
        await User.findByIdAndUpdate(req.user.id, {
            $inc: { 'stats.tokensUsed': aiResponse.tokens.total },
        });

        res.status(200).json({
            success: true,
            message: chat.messages[chat.messages.length - 1],
            chat: {
                _id: chat._id,
                title: chat.title,
                totalTokens: chat.totalTokens,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get user's chats
// @route   GET /api/chat/list
// @access  Private
exports.getChats = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search = '' } = req.query;

        const query = {
            userId: req.user.id,
            isArchived: false,
        };

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { 'messages.content': { $regex: search, $options: 'i' } },
            ];
        }

        const chats = await Chat.find(query)
            .sort({ lastMessageAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('title lastMessageAt totalTokens messages');

        const total = await Chat.countDocuments(query);

        res.status(200).json({
            success: true,
            chats,
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

// @desc    Get single chat with messages
// @route   GET /api/chat/:chatId
// @access  Private
exports.getChat = async (req, res, next) => {
    try {
        const chat = await Chat.findOne({
            _id: req.params.chatId,
            userId: req.user.id,
        });

        if (!chat) {
            return next(new AppError('Chat not found', 404));
        }

        res.status(200).json({
            success: true,
            chat,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update chat title
// @route   PATCH /api/chat/:chatId
// @access  Private
exports.updateChat = async (req, res, next) => {
    try {
        const { title } = req.body;

        const chat = await Chat.findOneAndUpdate(
            {
                _id: req.params.chatId,
                userId: req.user.id,
            },
            { title },
            { new: true, runValidators: true }
        );

        if (!chat) {
            return next(new AppError('Chat not found', 404));
        }

        res.status(200).json({
            success: true,
            chat,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete chat
// @route   DELETE /api/chat/:chatId
// @access  Private
exports.deleteChat = async (req, res, next) => {
    try {
        const chat = await Chat.findOneAndDelete({
            _id: req.params.chatId,
            userId: req.user.id,
        });

        if (!chat) {
            return next(new AppError('Chat not found', 404));
        }

        // Update user stats
        await User.findByIdAndUpdate(req.user.id, {
            $inc: { 'stats.totalChats': -1 },
        });

        res.status(200).json({
            success: true,
            message: 'Chat deleted successfully',
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Archive chat
// @route   PATCH /api/chat/:chatId/archive
// @access  Private
exports.archiveChat = async (req, res, next) => {
    try {
        const chat = await Chat.findOneAndUpdate(
            {
                _id: req.params.chatId,
                userId: req.user.id,
            },
            { isArchived: true },
            { new: true }
        );

        if (!chat) {
            return next(new AppError('Chat not found', 404));
        }

        res.status(200).json({
            success: true,
            message: 'Chat archived successfully',
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Clear chat messages
// @route   DELETE /api/chat/:chatId/messages
// @access  Private
exports.clearChat = async (req, res, next) => {
    try {
        const chat = await Chat.findOne({
            _id: req.params.chatId,
            userId: req.user.id,
        });

        if (!chat) {
            return next(new AppError('Chat not found', 404));
        }

        chat.messages = [];
        chat.totalTokens = 0;
        await chat.save();

        res.status(200).json({
            success: true,
            message: 'Chat cleared successfully',
        });
    } catch (error) {
        next(error);
    }
};