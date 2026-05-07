const CodeGeneration = require('../models/CodeGeneration');
const AIRequest = require('../models/AIRequest');
const User = require('../models/User');
const geminiService = require('../services/geminiService');
const { AppError } = require('../middleware/errorHandler');

// @desc    Generate code
// @route   POST /api/code/generate
// @access  Private
exports.generateCode = async (req, res, next) => {
    try {
        const { prompt, language } = req.body;

        if (!prompt || !language) {
            return next(new AppError('Prompt and language are required', 400));
        }

        // Validate language
        const supportedLanguages = [
            'javascript', 'python', 'java', 'c++', 'react', 'node.js',
            'typescript', 'html', 'css', 'sql', 'ruby', 'go', 'rust'
        ];

        if (!supportedLanguages.includes(language.toLowerCase())) {
            return next(new AppError(`Language ${language} is not supported`, 400));
        }

        // Generate code using Gemini
        const result = await geminiService.generateCode(prompt, language, 'generation');

        // Extract code from response
        const codeMatch = result.text.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        const cleanCode = codeMatch ? codeMatch[1].trim() : result.text;

        // Save code generation
        const codeGen = await CodeGeneration.create({
            userId: req.user.id,
            type: 'generation',
            language: language.toLowerCase(),
            title: `Generate ${language} code`,
            prompt,
            generatedCode: cleanCode,
            tokens: result.tokens,
        });

        // Log AI request
        await AIRequest.create({
            userId: req.user.id,
            type: 'code_generation',
            model: result.model,
            input: {
                text: prompt,
                code: `Language: ${language}`,
            },
            output: { code: cleanCode },
            tokens: result.tokens,
            status: 'completed',
            responseTime: result.responseTime,
        });

        // Update user stats
        await User.findByIdAndUpdate(req.user.id, {
            $inc: {
                'stats.totalCodeGenerations': 1,
                'stats.tokensUsed': result.tokens.total,
            },
        });

        res.status(201).json({
            success: true,
            code: {
                id: codeGen._id,
                language: codeGen.language,
                generatedCode: cleanCode,
                fullResponse: result.text,
                tokens: result.tokens,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Debug code
// @route   POST /api/code/debug
// @access  Private
exports.debugCode = async (req, res, next) => {
    try {
        const { code, language, errorDescription } = req.body;

        if (!code || !language) {
            return next(new AppError('Code and language are required', 400));
        }

        const prompt = errorDescription || "Debug this code and fix any issues";
        
        const result = await geminiService.generateCode(
            prompt,
            language,
            'debugging',
            code
        );

        // Parse debug response
        const debugInfo = parseDebugResponse(result.text, code);

        // Extract fixed code
        const codeMatch = result.text.match(/```(?:\w+)?\n?([\s\S]*?)```/);
        const fixedCode = codeMatch ? codeMatch[1].trim() : '';

        // Save code generation
        const codeGen = await CodeGeneration.create({
            userId: req.user.id,
            type: 'debugging',
            language: language.toLowerCase(),
            title: `Debug ${language} code`,
            prompt: errorDescription || 'Debug code',
            originalCode: code,
            generatedCode: fixedCode || code,
            debugResults: debugInfo,
            tokens: result.tokens,
        });

        // Log AI request
        await AIRequest.create({
            userId: req.user.id,
            type: 'code_generation',
            model: result.model,
            input: {
                text: prompt,
                code: code,
            },
            output: {
                code: fixedCode,
                text: result.text,
            },
            tokens: result.tokens,
            status: 'completed',
            responseTime: result.responseTime,
        });

        await User.findByIdAndUpdate(req.user.id, {
            $inc: {
                'stats.totalCodeGenerations': 1,
                'stats.tokensUsed': result.tokens.total,
            },
        });

        res.status(200).json({
            success: true,
            debug: {
                id: codeGen._id,
                issues: debugInfo.issues,
                fixes: debugInfo.fixes,
                suggestions: debugInfo.suggestions,
                fixedCode: fixedCode,
                fullResponse: result.text,
                tokens: result.tokens,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Explain code
// @route   POST /api/code/explain
// @access  Private
exports.explainCode = async (req, res, next) => {
    try {
        const { code, language } = req.body;

        if (!code || !language) {
            return next(new AppError('Code and language are required', 400));
        }

        const result = await geminiService.generateCode(
            'Explain this code in detail',
            language,
            'explanation',
            code
        );

        // Save code generation
        const codeGen = await CodeGeneration.create({
            userId: req.user.id,
            type: 'explanation',
            language: language.toLowerCase(),
            title: `Explain ${language} code`,
            prompt: 'Explain code',
            originalCode: code,
            explanation: result.text,
            tokens: result.tokens,
        });

        // Log AI request
        await AIRequest.create({
            userId: req.user.id,
            type: 'code_generation',
            model: result.model,
            input: {
                text: 'Explain code',
                code: code,
            },
            output: { text: result.text },
            tokens: result.tokens,
            status: 'completed',
            responseTime: result.responseTime,
        });

        await User.findByIdAndUpdate(req.user.id, {
            $inc: {
                'stats.totalCodeGenerations': 1,
                'stats.tokensUsed': result.tokens.total,
            },
        });

        res.status(200).json({
            success: true,
            explanation: {
                id: codeGen._id,
                explanation: result.text,
                tokens: result.tokens,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get code generation history
// @route   GET /api/code/history
// @access  Private
exports.getCodeHistory = async (req, res, next) => {
    try {
        const { page = 1, limit = 10, type = '' } = req.query;

        const query = { userId: req.user.id };
        if (type) {
            query.type = type;
        }

        const history = await CodeGeneration.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('-originalCode -generatedCode -explanation');

        const total = await CodeGeneration.countDocuments(query);

        res.status(200).json({
            success: true,
            history,
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

// @desc    Get single code generation
// @route   GET /api/code/:id
// @access  Private
exports.getCodeGeneration = async (req, res, next) => {
    try {
        const codeGen = await CodeGeneration.findOne({
            _id: req.params.id,
            userId: req.user.id,
        });

        if (!codeGen) {
            return next(new AppError('Code generation not found', 404));
        }

        res.status(200).json({
            success: true,
            codeGeneration: codeGen,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete code generation
// @route   DELETE /api/code/:id
// @access  Private
exports.deleteCodeGeneration = async (req, res, next) => {
    try {
        const codeGen = await CodeGeneration.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id,
        });

        if (!codeGen) {
            return next(new AppError('Code generation not found', 404));
        }

        await User.findByIdAndUpdate(req.user.id, {
            $inc: { 'stats.totalCodeGenerations': -1 },
        });

        res.status(200).json({
            success: true,
            message: 'Code generation deleted successfully',
        });
    } catch (error) {
        next(error);
    }
};

// Helper function to parse debug response
function parseDebugResponse(response, originalCode) {
    const debugInfo = {
        issues: [],
        fixes: [],
        suggestions: [],
    };

    try {
        // Extract issues
        const issuesMatch = response.match(/issues?[^:]*:\s*\n?([\s\S]*?)(?=fix|fixed code|solution|$)/i);
        if (issuesMatch) {
            debugInfo.issues = issuesMatch[1]
                .split('\n')
                .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
                .map(line => line.replace(/^[-*]\s*/, '').trim());
        }

        // Extract fixes
        const fixesMatch = response.match(/fix(?:es)?[^:]*:\s*\n?([\s\S]*?)(?=suggestion|note|$)/i);
        if (fixesMatch) {
            debugInfo.fixes = fixesMatch[1]
                .split('\n')
                .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
                .map(line => line.replace(/^[-*]\s*/, '').trim());
        }

        // Extract suggestions
        const suggestionsMatch = response.match(/suggestion(?:s)?[^:]*:\s*\n?([\s\S]*?)(?=$)/i);
        if (suggestionsMatch) {
            debugInfo.suggestions = suggestionsMatch[1]
                .split('\n')
                .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
                .map(line => line.replace(/^[-*]\s*/, '').trim());
        }
    } catch (error) {
        console.error('Error parsing debug response:', error);
    }

    return debugInfo;
}