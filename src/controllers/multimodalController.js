const fs = require('fs');
const File = require('../models/File');
const AIRequest = require('../models/AIRequest');
const User = require('../models/User');
const geminiService = require('../services/geminiService');
const { AppError } = require('../middleware/errorHandler');

// @desc    Process multimodal input (text + image + document)
// @route   POST /api/multimodal/process
// @access  Private
exports.processMultimodal = async (req, res, next) => {
    try {
        const { text, documentContent } = req.body;
        const files = req.files || [];
        
        // Validate that at least one input type is provided
        if (!text && files.length === 0 && !documentContent) {
            return next(new AppError('Please provide at least one input (text, image, or document)', 400));
        }

        // Save uploaded files
        const savedFiles = [];
        const imagePaths = [];

        for (const file of files) {
            const savedFile = await File.create({
                userId: req.user.id,
                filename: file.filename,
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                path: file.path,
                type: file.mimetype.startsWith('image/') ? 'image' : 'document',
                processedBy: 'multimodal',
            });
            
            savedFiles.push(savedFile);
            imagePaths.push(file.path);
        }

        // Process with Gemini
        const prompt = text || "Analyze the provided content and images comprehensively.";
        
        const result = await geminiService.multimodalProcess(
            prompt,
            imagePaths,
            documentContent
        );

        // Update files with AI response
        for (const file of savedFiles) {
            file.aiResponse = {
                analysis: result.text,
            };
            file.metadata = {
                ...file.metadata,
                aiDescription: result.text.substring(0, 500),
            };
            await file.save();
        }

        // Log AI request
        await AIRequest.create({
            userId: req.user.id,
            type: 'multimodal',
            model: result.model,
            input: {
                text: text,
                images: imagePaths,
                documents: documentContent ? ['document_content'] : [],
            },
            output: {
                text: result.text,
            },
            tokens: result.tokens,
            status: 'completed',
            responseTime: result.responseTime,
        });

        // Update user stats
        await User.findByIdAndUpdate(req.user.id, {
            $inc: {
                'stats.tokensUsed': result.tokens.total,
            },
        });

        res.status(200).json({
            success: true,
            result: {
                text: result.text,
                tokens: result.tokens,
                responseTime: result.responseTime,
            },
            files: savedFiles.map(f => ({
                id: f._id,
                filename: f.filename,
                originalName: f.originalName,
                url: f.path.startsWith('http') ? f.path : `/uploads/${f.type}s/${f.filename}`,
            })),
        });
    } catch (error) {
        // Clean up uploaded files if error occurs
        if (req.files) {
            req.files.forEach(file => {
                if (file.path.startsWith('http')) {
                    const cloudinary = require('cloudinary').v2;
                    cloudinary.uploader.destroy(file.filename).catch(err => console.error('Cloudinary delete error:', err));
                } else {
                    fs.unlink(file.path, (err) => {
                        if (err) console.error('Error deleting file:', err);
                    });
                }
            });
        }
        next(error);
    }
};

// @desc    Chat with multimodal context
// @route   POST /api/multimodal/chat
// @access  Private
exports.multimodalChat = async (req, res, next) => {
    try {
        const { message, fileIds } = req.body;

        // Fetch referenced files
        const files = await File.find({
            _id: { $in: fileIds },
            userId: req.user.id,
        });

        const imagePaths = files
            .filter(f => f.type === 'image')
            .map(f => f.path);

        const documentContents = await Promise.all(
            files
                .filter(f => f.type === 'document')
                .map(async (f) => {
                    try {
                        let content;
                        if (f.path.startsWith('http')) {
                            const response = await fetch(f.path);
                            content = await response.text();
                        } else {
                            content = fs.readFileSync(f.path, 'utf-8');
                        }
                        return content;
                    } catch (error) {
                        console.error(`Error reading file ${f.filename}:`, error);
                        return '';
                    }
                })
        );

        const combinedDocument = documentContents.join('\n\n');

        const result = await geminiService.multimodalProcess(
            message,
            imagePaths,
            combinedDocument
        );

        // Log AI request
        await AIRequest.create({
            userId: req.user.id,
            type: 'multimodal',
            model: result.model,
            input: {
                text: message,
                images: imagePaths,
                documents: fileIds,
            },
            output: { text: result.text },
            tokens: result.tokens,
            status: 'completed',
            responseTime: result.responseTime,
        });

        await User.findByIdAndUpdate(req.user.id, {
            $inc: { 'stats.tokensUsed': result.tokens.total },
        });

        res.status(200).json({
            success: true,
            text: result.text,
            tokens: result.tokens,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get multimodal history
// @route   GET /api/multimodal/history
// @access  Private
exports.getMultimodalHistory = async (req, res, next) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const requests = await AIRequest.find({
            userId: req.user.id,
            type: 'multimodal',
        })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await AIRequest.countDocuments({
            userId: req.user.id,
            type: 'multimodal',
        });

        res.status(200).json({
            success: true,
            requests,
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