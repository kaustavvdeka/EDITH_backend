const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

// All routes require authentication
router.use(protect);

// Validation
const updateProfileValidation = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters'),
];

const changePasswordValidation = [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
];

const { imageUpload } = require('../middleware/upload');

// User routes
router.get('/profile', userController.getProfile);
router.put('/profile', imageUpload.single('avatar'), updateProfileValidation, validate, userController.updateProfile);
router.put('/change-password', changePasswordValidation, validate, userController.changePassword);
router.get('/dashboard', userController.getDashboard);
router.get('/activity', userController.getActivityLog);
router.delete('/account', userController.deleteAccount);

// Admin routes
router.get('/admin/users', authorize('admin'), userController.getAllUsers);
router.get('/admin/stats', authorize('admin'), userController.getAdminStats);

module.exports = router;