const fs = require('fs');
const File = require('../models/File');
const ImageAnalysis = require('../models/ImageAnalysis');
const AIRequest = require('../models/AIRequest');
const User = require('../models/User');
const geminiService = require('../services/geminiService');
const { AppError } = require('../middleware/errorHandler');

// @desc    Upload and analyze image
// @route   POST /api/image/analyze
// @access  Private
exports.analyzeImage = async (req, res, next) => {
    try {
        if (!req.file) {
            return next(new AppError('Please upload an image', 400));
        }

        const { prompt } = req.body;
        const defaultPrompt = "Analyze this image in detail. Describe what you see, identify objects, scenes, text, colors, and provide a comprehensive description.";

        // Create file record
        const file = await File.create({
            userId: req.user.id,
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            path: req.file.path,
            type: 'image',
            processedBy: 'vision',
        });

        // Analyze image with Gemini Vision
        const analysis = await geminiService.analyzeImage(
            req.file.path,
            prompt || defaultPrompt
        );

        // Parse analysis to extract structured data
        const analysisData = parseAnalysisResponse(analysis.text);

        // Create image analysis record
        const imageAnalysis = await ImageAnalysis.create({
            userId: req.user.id,
            file: file._id,
            analysis: analysisData,
            prompt: prompt || defaultPrompt,
            response: analysis.text,
            tokens: analysis.tokens,
            processingTime: analysis.responseTime,
        });

        // Update file with AI response
        file.aiResponse = {
            analysis: analysis.text,
            extractedText: analysisData.textExtracted || '',
        };
        await file.save();

        // Log AI request
        await AIRequest.create({
            userId: req.user.id,
            type: 'image_analysis',
            model: analysis.model,
            input: {
                text: prompt || defaultPrompt,
                images: [req.file.path],
            },
            output: { analysis: analysis.text },
            tokens: analysis.tokens,
            status: 'completed',
            responseTime: analysis.responseTime,
        });

        // Update user stats
        await User.findByIdAndUpdate(req.user.id, {
            $inc: {
                'stats.totalImages': 1,
                'stats.tokensUsed': analysis.tokens.total,
            },
        });

        res.status(201).json({
            success: true,
            analysis: imageAnalysis,
            file: {
                id: file._id,
                url: req.file.path.startsWith('http') ? req.file.path : `/uploads/images/${file.filename}`,
                originalName: file.originalName,
            },
        });
    } catch (error) {
        // Clean up uploaded file if error occurs
        if (req.file) {
            if (req.file.path.startsWith('http')) {
                const cloudinary = require('cloudinary').v2;
                cloudinary.uploader.destroy(req.file.filename).catch(err => console.error('Cloudinary delete error:', err));
            } else {
                fs.unlink(req.file.path, (err) => {
                    if (err) console.error('Error deleting file:', err);
                });
            }
        }
        next(error);
    }
};

// @desc    Get image analysis history
// @route   GET /api/image/history
// @access  Private
exports.getImageHistory = async (req, res, next) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const analyses = await ImageAnalysis.find({ userId: req.user.id })
            .populate('file', 'filename originalName path')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await ImageAnalysis.countDocuments({ userId: req.user.id });

        res.status(200).json({
            success: true,
            analyses,
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

// @desc    Get single analysis
// @route   GET /api/image/analysis/:id
// @access  Private
exports.getAnalysis = async (req, res, next) => {
    try {
        const analysis = await ImageAnalysis.findOne({
            _id: req.params.id,
            userId: req.user.id,
        }).populate('file');

        if (!analysis) {
            return next(new AppError('Analysis not found', 404));
        }

        res.status(200).json({
            success: true,
            analysis,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete analysis
// @route   DELETE /api/image/analysis/:id
// @access  Private
exports.deleteAnalysis = async (req, res, next) => {
    try {
        const analysis = await ImageAnalysis.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id,
        });

        if (!analysis) {
            return next(new AppError('Analysis not found', 404));
        }

        // Delete associated file
        const file = await File.findByIdAndDelete(analysis.file);
        if (file && file.path) {
            if (file.path.startsWith('http')) {
                const cloudinary = require('cloudinary').v2;
                cloudinary.uploader.destroy(file.filename).catch(err => console.error('Cloudinary delete error:', err));
            } else {
                fs.unlink(file.path, (err) => {
                    if (err) console.error('Error deleting file:', err);
                });
            }
        }

        res.status(200).json({
            success: true,
            message: 'Analysis deleted successfully',
        });
    } catch (error) {
        next(error);
    }
};

// Helper function to parse AI analysis response
function parseAnalysisResponse(response) {
    const analysis = {
        description: '',
        objects: [],
        scenes: [],
        textExtracted: '',
        colors: [],
        tags: [],
    };

    try {
        // Extract description (first paragraph)
        const paragraphs = response.split('\n\n');
        if (paragraphs.length > 0) {
            analysis.description = paragraphs[0].trim();
        }

        // Extract text content if mentioned
        const textMatch = response.match(/text (?:in|from) the image:?\s*["']?(.*?)["']?(?:\n|$)/i);
        if (textMatch) {
            analysis.textExtracted = textMatch[1];
        }

        // Extract objects (common pattern in AI responses)
        const objectMatches = response.match(/objects?[^:]*:\s*([^\n]+)/gi);
        if (objectMatches) {
            objectMatches.forEach(match => {
                const objects = match.split(':')[1];
                if (objects) {
                    objects.split(',').forEach(obj => {
                        const trimmed = obj.trim();
                        if (trimmed) {
                            analysis.objects.push({
                                name: trimmed,
                                confidence: 0.9,
                            });
                        }
                    });
                }
            });
        }

        // Extract colors
        const colorMatches = response.match(/\b(red|blue|green|yellow|purple|orange|black|white|gray|brown|pink|gold|silver)\b/gi);
        if (colorMatches) {
            analysis.colors = [...new Set(colorMatches.map(c => c.toLowerCase()))];
        }

    } catch (error) {
        console.error('Error parsing analysis response:', error);
    }

    return analysis;
}