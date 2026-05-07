const fs = require('fs');
const Summary = require('../models/Summary');
const File = require('../models/File');
const AIRequest = require('../models/AIRequest');
const User = require('../models/User');
const geminiService = require('../services/geminiService');
const { AppError } = require('../middleware/errorHandler');

// @desc    Summarize text
// @route   POST /api/summary/text
// @access  Private
exports.summarizeText = async (req, res, next) => {
    try {
        const { text, title, type = 'comprehensive' } = req.body;

        if (!text) {
            return next(new AppError('Text is required', 400));
        }

        if (text.length < 100) {
            return next(new AppError('Text must be at least 100 characters for summarization', 400));
        }

        // Generate summary using Gemini
        const result = await geminiService.summarizeDocument(text, type);

        // Parse summary based on type
        const summaryData = parseSummaryResponse(result.text, type);

        // Create summary record
        const summary = await Summary.create({
            userId: req.user.id,
            title: title || 'Text Summary',
            originalContent: text,
            shortSummary: summaryData.shortSummary,
            bulletSummary: summaryData.bulletSummary,
            keyPoints: summaryData.keyPoints,
            actionItems: summaryData.actionItems,
            sourceType: 'text',
            tokens: result.tokens,
            wordCount: {
                original: text.split(/\s+/).length,
                summary: result.text.split(/\s+/).length,
            },
        });

        // Log AI request
        await AIRequest.create({
            userId: req.user.id,
            type: 'summarization',
            model: result.model,
            input: { text: text },
            output: {
                text: result.text,
                summary: summaryData.shortSummary,
            },
            tokens: result.tokens,
            status: 'completed',
            responseTime: result.responseTime,
        });

        // Update user stats
        await User.findByIdAndUpdate(req.user.id, {
            $inc: {
                'stats.totalSummaries': 1,
                'stats.tokensUsed': result.tokens.total,
            },
        });

        res.status(201).json({
            success: true,
            summary: {
                id: summary._id,
                title: summary.title,
                shortSummary: summaryData.shortSummary,
                bulletSummary: summaryData.bulletSummary,
                keyPoints: summaryData.keyPoints,
                actionItems: summaryData.actionItems,
                fullResponse: result.text,
                wordCount: summary.wordCount,
                tokens: result.tokens,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Summarize PDF document
// @route   POST /api/summary/pdf
// @access  Private
exports.summarizePDF = async (req, res, next) => {
    try {
        if (!req.file) {
            return next(new AppError('Please upload a PDF file', 400));
        }

        const { type = 'comprehensive' } = req.body;

        // Extract text from PDF
        let pdfText = '';
        try {
            const pdfParse = require('pdf-parse');
            let dataBuffer;
            if (req.file.path.startsWith('http')) {
                const response = await fetch(req.file.path);
                const arrayBuffer = await response.arrayBuffer();
                dataBuffer = Buffer.from(arrayBuffer);
            } else {
                dataBuffer = fs.readFileSync(req.file.path);
            }
            const pdfData = await pdfParse(dataBuffer);
            pdfText = pdfData.text;

            if (!pdfText || pdfText.trim().length < 100) {
                return next(new AppError('PDF has insufficient text content for summarization', 400));
            }
        } catch (error) {
            console.error('PDF parsing error:', error);
            return next(new AppError('Failed to parse PDF file', 400));
        }

        // Save file record
        const file = await File.create({
            userId: req.user.id,
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            path: req.file.path,
            type: 'document',
            processedBy: 'summarizer',
            metadata: {
                pages: pdfText ? Math.ceil(pdfText.length / 3000) : 1,
            },
        });

        // Generate summary
        const result = await geminiService.summarizeDocument(pdfText, type);

        // Parse summary
        const summaryData = parseSummaryResponse(result.text, type);

        // Create summary record
        const summary = await Summary.create({
            userId: req.user.id,
            title: `Summary of ${req.file.originalname}`,
            originalContent: pdfText,
            shortSummary: summaryData.shortSummary,
            bulletSummary: summaryData.bulletSummary,
            keyPoints: summaryData.keyPoints,
            actionItems: summaryData.actionItems,
            sourceType: 'pdf',
            sourceFile: file._id,
            tokens: result.tokens,
            wordCount: {
                original: pdfText.split(/\s+/).length,
                summary: result.text.split(/\s+/).length,
            },
        });

        // Update file with AI response
        file.aiResponse = {
            summary: result.text,
            analysis: summaryData.shortSummary,
        };
        await file.save();

        // Log AI request
        await AIRequest.create({
            userId: req.user.id,
            type: 'summarization',
            model: result.model,
            input: {
                text: pdfText.substring(0, 1000) + '...',
                documents: [req.file.filename],
            },
            output: { text: result.text },
            tokens: result.tokens,
            status: 'completed',
            responseTime: result.responseTime,
        });

        await User.findByIdAndUpdate(req.user.id, {
            $inc: {
                'stats.totalSummaries': 1,
                'stats.tokensUsed': result.tokens.total,
            },
        });

        res.status(201).json({
            success: true,
            summary: {
                id: summary._id,
                title: summary.title,
                shortSummary: summaryData.shortSummary,
                bulletSummary: summaryData.bulletSummary,
                keyPoints: summaryData.keyPoints,
                actionItems: summaryData.actionItems,
                fullResponse: result.text,
                wordCount: summary.wordCount,
                tokens: result.tokens,
            },
            file: {
                id: file._id,
                filename: file.filename,
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

// @desc    Get summary history
// @route   GET /api/summary/history
// @access  Private
exports.getSummaryHistory = async (req, res, next) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const summaries = await Summary.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('-originalContent')
            .populate('sourceFile', 'filename originalName');

        const total = await Summary.countDocuments({ userId: req.user.id });

        res.status(200).json({
            success: true,
            summaries,
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

// @desc    Get single summary
// @route   GET /api/summary/:id
// @access  Private
exports.getSummary = async (req, res, next) => {
    try {
        const summary = await Summary.findOne({
            _id: req.params.id,
            userId: req.user.id,
        }).populate('sourceFile', 'filename originalName path');

        if (!summary) {
            return next(new AppError('Summary not found', 404));
        }

        res.status(200).json({
            success: true,
            summary,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete summary
// @route   DELETE /api/summary/:id
// @access  Private
exports.deleteSummary = async (req, res, next) => {
    try {
        const summary = await Summary.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id,
        });

        if (!summary) {
            return next(new AppError('Summary not found', 404));
        }

        // If there's an associated file, delete it too
        if (summary.sourceFile) {
            const file = await File.findByIdAndDelete(summary.sourceFile);
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
        }

        await User.findByIdAndUpdate(req.user.id, {
            $inc: { 'stats.totalSummaries': -1 },
        });

        res.status(200).json({
            success: true,
            message: 'Summary deleted successfully',
        });
    } catch (error) {
        next(error);
    }
};

// Helper function to parse summary response
function parseSummaryResponse(response, type) {
    const summaryData = {
        shortSummary: '',
        bulletSummary: [],
        keyPoints: [],
        actionItems: [],
    };

    try {
        switch (type) {
            case 'short':
                summaryData.shortSummary = response.trim();
                break;
                
            case 'bullets':
                summaryData.bulletSummary = response
                    .split('\n')
                    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('•') || line.trim().startsWith('*'))
                    .map(line => line.replace(/^[-•*]\s*/, '').trim());
                break;
                
            case 'key_points':
                summaryData.keyPoints = response
                    .split('\n')
                    .filter(line => line.trim().match(/^\d+\./) || line.trim().startsWith('-'))
                    .map(line => line.replace(/^\d+\.\s*|-\s*/, '').trim());
                break;
                
            case 'action_items':
                summaryData.actionItems = response
                    .split('\n')
                    .filter(line => line.trim().startsWith('-') || line.trim().startsWith('['))
                    .map(line => line.replace(/^[-\[\]]\s*/, '').trim());
                break;
                
            default:
                // Comprehensive summary - parse all sections
                const sections = response.split(/\d+\.\s+/);
                sections.forEach(section => {
                    if (section.toLowerCase().includes('short summary')) {
                        summaryData.shortSummary = section.replace(/short summary:?\s*/i, '').trim();
                    } else if (section.toLowerCase().includes('bullet')) {
                        summaryData.bulletSummary = section
                            .split('\n')
                            .filter(line => line.trim().startsWith('-'))
                            .map(line => line.replace(/^-\s*/, '').trim());
                    } else if (section.toLowerCase().includes('key point')) {
                        summaryData.keyPoints = section
                            .split('\n')
                            .filter(line => line.trim().startsWith('-'))
                            .map(line => line.replace(/^-\s*/, '').trim());
                    } else if (section.toLowerCase().includes('action')) {
                        summaryData.actionItems = section
                            .split('\n')
                            .filter(line => line.trim().startsWith('-'))
                            .map(line => line.replace(/^-\s*/, '').trim());
                    }
                });
                
                // If no short summary found in sections, use first paragraph
                if (!summaryData.shortSummary && sections.length > 0) {
                    summaryData.shortSummary = sections[0].trim();
                }
        }
    } catch (error) {
        console.error('Error parsing summary response:', error);
        summaryData.shortSummary = response.substring(0, 500);
    }

    return summaryData;
}