const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const summaryController = require('../controllers/summaryController');
const { protect } = require('../middleware/auth');
const { documentUpload, handleMulterError } = require('../middleware/upload');
const validate = require('../middleware/validate');

// All routes require authentication
router.use(protect);

// Validation
const summarizeTextValidation = [
    body('text')
        .trim()
        .notEmpty()
        .withMessage('Text is required')
        .isLength({ min: 100 })
        .withMessage('Text must be at least 100 characters'),
    body('type')
        .optional()
        .isIn(['short', 'bullets', 'key_points', 'action_items', 'comprehensive'])
        .withMessage('Invalid summary type'),
];

// Routes
router.post('/text', summarizeTextValidation, validate, summaryController.summarizeText);
router.post(
    '/pdf',
    documentUpload.single('document'),
    handleMulterError,
    summaryController.summarizePDF
);
router.get('/history', summaryController.getSummaryHistory);
router.get('/:id', summaryController.getSummary);
router.delete('/:id', summaryController.deleteSummary);

module.exports = router;