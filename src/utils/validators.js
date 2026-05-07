const { body, param, query } = require('express-validator');

class Validators {
    // Auth validators
    static register() {
        return [
            body('name')
                .trim()
                .isLength({ min: 2, max: 50 })
                .withMessage('Name must be between 2 and 50 characters'),
            body('email')
                .isEmail()
                .normalizeEmail()
                .withMessage('Please provide a valid email address'),
            body('password')
                .isLength({ min: 8 })
                .withMessage('Password must be at least 8 characters')
                .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
                .withMessage('Password must contain uppercase, lowercase, number and special character'),
        ];
    }

    static login() {
        return [
            body('email')
                .isEmail()
                .normalizeEmail()
                .withMessage('Please provide a valid email address'),
            body('password')
                .notEmpty()
                .withMessage('Password is required'),
        ];
    }

    // Chat validators
    static sendMessage() {
        return [
            body('message')
                .trim()
                .notEmpty()
                .withMessage('Message cannot be empty')
                .isLength({ max: 4000 })
                .withMessage('Message too long (max 4000 characters)'),
        ];
    }

    // Code validators
    static generateCode() {
        return [
            body('prompt')
                .trim()
                .notEmpty()
                .withMessage('Prompt is required'),
            body('language')
                .trim()
                .notEmpty()
                .withMessage('Language is required')
                .isIn(['javascript', 'python', 'java', 'c++', 'react', 'node.js', 'typescript'])
                .withMessage('Unsupported programming language'),
        ];
    }

    // Summary validators
    static summarizeText() {
        return [
            body('text')
                .trim()
                .notEmpty()
                .withMessage('Text is required')
                .isLength({ min: 100 })
                .withMessage('Text must be at least 100 characters'),
        ];
    }

    // ID parameter validator
    static mongoId() {
        return param('id')
            .isMongoId()
            .withMessage('Invalid ID format');
    }
}

module.exports = Validators;