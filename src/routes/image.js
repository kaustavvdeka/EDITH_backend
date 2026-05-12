const express = require('express');
const router = express.Router();
const imageController = require('../controllers/imageController');
const { protect } = require('../middleware/auth');
const { imageUpload, handleMulterError, validateFileMagicBytes } = require('../middleware/upload');

// All routes require authentication
router.use(protect);

// Routes
router.post(
    '/analyze',
    imageUpload.single('image'),
    handleMulterError,
    validateFileMagicBytes,
    imageController.analyzeImage
);
router.get('/history', imageController.getImageHistory);
router.get('/analysis/:id', imageController.getAnalysis);
router.delete('/analysis/:id', imageController.deleteAnalysis);

module.exports = router;