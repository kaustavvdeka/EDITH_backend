const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const codeController = require('../controllers/codeController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

// All routes require authentication
router.use(protect);

// Validation
const generateCodeValidation = [
    body('prompt')
        .trim()
        .notEmpty()
        .withMessage('Prompt is required'),
    body('language')
        .trim()
        .notEmpty()
        .withMessage('Language is required'),
];

const debugCodeValidation = [
    body('code')
        .trim()
        .notEmpty()
        .withMessage('Code is required'),
    body('language')
        .trim()
        .notEmpty()
        .withMessage('Language is required'),
];

// Routes
router.post('/generate', generateCodeValidation, validate, codeController.generateCode);
router.post('/debug', debugCodeValidation, validate, codeController.debugCode);
router.post('/explain', debugCodeValidation, validate, codeController.explainCode);
router.get('/history', codeController.getCodeHistory);
router.get('/:id', codeController.getCodeGeneration);
router.delete('/:id', codeController.deleteCodeGeneration);

module.exports = router;