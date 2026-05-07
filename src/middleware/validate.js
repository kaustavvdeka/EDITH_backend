const { validationResult } = require('express-validator');

/**
 * Middleware to validate request data using express-validator
 * Checks for validation errors and returns them in a structured format
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const validate = (req, res, next) => {
    try {
        // Extract validation errors from the request
        const errors = validationResult(req);
        
        // If there are validation errors
        if (!errors.isEmpty()) {
            // Format errors for better readability
            const formattedErrors = errors.array().map(error => ({
                field: error.path || error.param || 'unknown',
                message: error.msg,
                value: error.value,
                location: error.location,
            }));

            // Log validation errors in development
            if (process.env.NODE_ENV === 'development') {
                console.log('Validation Errors:', JSON.stringify(formattedErrors, null, 2));
            }

            // Return 400 Bad Request with error details
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: 'The request contains invalid or missing fields',
                errors: formattedErrors,
                timestamp: new Date().toISOString(),
            });
        }
        
        // No validation errors, proceed to next middleware
        next();
    } catch (error) {
        // If something goes wrong during validation
        console.error('Validation middleware error:', error);
        
        return res.status(500).json({
            success: false,
            error: 'Internal validation error',
            message: 'An error occurred during request validation',
            timestamp: new Date().toISOString(),
        });
    }
};

/**
 * Custom validation rules that can be reused across routes
 */
const customValidators = {
    // Validate MongoDB ObjectId
    isValidObjectId: (value) => {
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(value)) {
            throw new Error('Invalid ID format');
        }
        return true;
    },

    // Validate password strength
    isStrongPassword: (value) => {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(value);
        const hasLowerCase = /[a-z]/.test(value);
        const hasNumbers = /\d/.test(value);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);

        if (value.length < minLength) {
            throw new Error(`Password must be at least ${minLength} characters long`);
        }
        if (!hasUpperCase) {
            throw new Error('Password must contain at least one uppercase letter');
        }
        if (!hasLowerCase) {
            throw new Error('Password must contain at least one lowercase letter');
        }
        if (!hasNumbers) {
            throw new Error('Password must contain at least one number');
        }
        if (!hasSpecialChar) {
            throw new Error('Password must contain at least one special character');
        }
        return true;
    },

    // Validate URL format
    isValidUrl: (value) => {
        try {
            new URL(value);
            return true;
        } catch (error) {
            throw new Error('Invalid URL format');
        }
    },

    // Validate file type (for use with multer)
    isValidFileType: (allowedTypes) => {
        return (req, file, cb) => {
            if (!file) {
                cb(new Error('No file provided'));
                return;
            }
            
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`), false);
            }
        };
    },

    // Validate file size
    isValidFileSize: (maxSize) => {
        return (value, { req }) => {
            if (req.file && req.file.size > maxSize) {
                throw new Error(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
            }
            return true;
        };
    },

    // Validate array not empty
    isNotEmptyArray: (value) => {
        if (!Array.isArray(value) || value.length === 0) {
            throw new Error('Array must not be empty');
        }
        return true;
    },

    // Validate date format
    isValidDate: (value) => {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
            throw new Error('Invalid date format');
        }
        return true;
    },

    // Validate phone number
    isValidPhone: (value) => {
        const phoneRegex = /^\+?[\d\s-()]{10,}$/;
        if (!phoneRegex.test(value)) {
            throw new Error('Invalid phone number format');
        }
        return true;
    },
};

/**
 * Sanitization middleware
 * Cleans and sanitizes request data before processing
 */
const sanitize = (req, res, next) => {
    try {
        // Sanitize body
        if (req.body) {
            Object.keys(req.body).forEach(key => {
                if (typeof req.body[key] === 'string') {
                    // Trim whitespace
                    req.body[key] = req.body[key].trim();
                    
                    // Basic XSS prevention - escape HTML characters
                    req.body[key] = req.body[key]
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#x27;');
                }
            });
        }

        // Sanitize query parameters
        if (req.query) {
            Object.keys(req.query).forEach(key => {
                if (typeof req.query[key] === 'string') {
                    req.query[key] = req.query[key].trim();
                }
            });
        }

        // Sanitize params
        if (req.params) {
            Object.keys(req.params).forEach(key => {
                if (typeof req.params[key] === 'string') {
                    req.params[key] = req.params[key].trim();
                }
            });
        }

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Conditional validation middleware
 * Only validates if a certain condition is met
 * 
 * @param {Function} condition - Function that returns true/false
 * @param {Array} validations - Array of validation middlewares
 */
const validateIf = (condition, validations) => {
    return async (req, res, next) => {
        try {
            const shouldValidate = await condition(req);
            
            if (shouldValidate) {
                // Run all validations
                for (const validation of validations) {
                    await validation(req, res, (err) => {
                        if (err) throw err;
                    });
                }
            }
            
            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Dynamic validation middleware
 * Allows dynamic validation rules based on request data
 * 
 * @param {Function} rulesBuilder - Function that returns validation rules array
 */
const dynamicValidate = (rulesBuilder) => {
    return async (req, res, next) => {
        try {
            const rules = await rulesBuilder(req);
            const validations = rules.map(rule => rule.run(req));
            await Promise.all(validations);
            
            // Check for validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    errors: errors.array(),
                });
            }
            
            next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * Specific validators for common use cases
 */
const specificValidators = {
    // Pagination query parameters validation
    paginationRules: [
        (req, res, next) => {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            
            if (page < 1) {
                return res.status(400).json({
                    success: false,
                    error: 'Page number must be greater than 0',
                });
            }
            
            if (limit < 1 || limit > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Limit must be between 1 and 100',
                });
            }
            
            // Update query with validated values
            req.query.page = page;
            req.query.limit = limit;
            
            next();
        },
    ],

    // Search query validation
    searchRules: [
        (req, res, next) => {
            if (req.query.search && req.query.search.length > 100) {
                return res.status(400).json({
                    success: false,
                    error: 'Search query too long (max 100 characters)',
                });
            }
            next();
        },
    ],

    // File upload validation
    fileUploadRules: (req, res, next) => {
        if (!req.file && !req.files) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded',
            });
        }
        
        // Check if multiple files
        const files = req.files || [req.file];
        
        for (const file of files) {
            // Check file size (10MB limit)
            if (file.size > 10 * 1024 * 1024) {
                return res.status(400).json({
                    success: false,
                    error: 'File size must be less than 10MB',
                });
            }
        }
        
        next();
    },
};

// Export the main validate middleware and all utilities
module.exports = validate;
module.exports.customValidators = customValidators;
module.exports.sanitize = sanitize;
module.exports.validateIf = validateIf;
module.exports.dynamicValidate = dynamicValidate;
module.exports.specificValidators = specificValidators;
module.exports.validationResult = validationResult;