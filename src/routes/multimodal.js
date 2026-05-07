const express = require('express');
const router = express.Router();
const multimodalController = require('../controllers/multimodalController');
const { protect } = require('../middleware/auth');
const { generalUpload, handleMulterError } = require('../middleware/upload');

// All routes require authentication
router.use(protect);

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