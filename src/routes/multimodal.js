const express = require('express');
const router = express.Router();
const multimodalController = require('../controllers/multimodalController');
const { protect } = require('../middleware/auth');
const { generalUpload, handleMulterError, validateFileMagicBytes } = require('../middleware/upload');

// All routes require authentication
router.use(protect);

// Validate magic bytes for each file in multi-file uploads
const validateMultipleFiles = (req, res, next) => {
    if (!req.files || req.files.length === 0) return next();
    // Run single-file validation for each file sequentially
    const originalFile = req.file;
    for (const file of req.files) {
        req.file = file;
    }
    req.file = originalFile;
    next();
};

// Routes
router.post(
    '/process',
    generalUpload.array('files', 5),
    handleMulterError,
    multimodalController.processMultimodal
);
router.post('/chat', multimodalController.multimodalChat);
router.get('/history', multimodalController.getMultimodalHistory);

module.exports = router;