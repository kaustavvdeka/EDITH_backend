// Custom error class
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

// Development error response
const sendErrorDev = (err, res) => {
    res.status(err.statusCode).json({
        success: false,
        error: err.message,
        stack: err.stack,
    });
};

// Production error response
const sendErrorProd = (err, res) => {
    // Operational, trusted error: send message to client
    if (err.isOperational) {
        res.status(err.statusCode).json({
            success: false,
            error: err.message,
        });
    } else {
        // Programming or other unknown error: don't leak error details
        console.error('ERROR 💥', err);
        
        res.status(500).json({
            success: false,
            error: 'Something went wrong!',
        });
    }
};

// Mongoose validation error handler
const handleValidationError = (err) => {
    const errors = Object.values(err.errors).map(el => el.message);
    const message = `Invalid input data. ${errors.join('. ')}`;
    return new AppError(message, 400);
};

// Mongoose duplicate key error handler
const handleDuplicateKeyError = (err) => {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate field value: ${field}. Please use another value!`;
    return new AppError(message, 400);
};

// Mongoose cast error handler
const handleCastError = (err) => {
    const message = `Invalid ${err.path}: ${err.value}`;
    return new AppError(message, 400);
};

// JWT error handler
const handleJWTError = () => new AppError('Invalid token. Please log in again!', 401);

// JWT expired error handler
const handleJWTExpiredError = () => new AppError('Your token has expired! Please log in again.', 401);

// Global error handling middleware
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(err, res);
    } else {
        let error = { ...err };
        error.message = err.message;

        // Handle specific error types
        if (error.name === 'ValidationError') error = handleValidationError(error);
        if (error.code === 11000) error = handleDuplicateKeyError(error);
        if (error.name === 'CastError') error = handleCastError(error);
        if (error.name === 'JsonWebTokenError') error = handleJWTError();
        if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

        sendErrorProd(error, res);
    }
};

module.exports = errorHandler;
module.exports.AppError = AppError;