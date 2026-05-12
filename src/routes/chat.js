const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const chatController = require('../controllers/chatController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

// All routes require authentication
router.use(protect);

// Validation
const sendMessageValidation = [
    body('message')
        .trim()
        .notEmpty()
        .withMessage('Message is required')
        .isLength({ max: 4000 })
        .withMessage('Message cannot exceed 4000 characters'),
];

const updateChatValidation = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ max: 100 })
        .withMessage('Title cannot exceed 100 characters'),
];

// Routes
router.post('/new', chatController.createChat);
router.post('/:chatId/message', sendMessageValidation, validate, chatController.sendMessage);
router.post('/:chatId/stream', sendMessageValidation, validate, chatController.streamMessage);
router.get('/list', chatController.getChats);
router.get('/:chatId', chatController.getChat);
router.patch('/:chatId', updateChatValidation, validate, chatController.updateChat);
router.delete('/:chatId', chatController.deleteChat);
router.patch('/:chatId/archive', chatController.archiveChat);
router.delete('/:chatId/messages', chatController.clearChat);

module.exports = router;