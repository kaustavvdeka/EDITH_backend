const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const imageRoutes = require('./routes/image');
const multimodalRoutes = require('./routes/multimodal');
const codeRoutes = require('./routes/code');
const summaryRoutes = require('./routes/summary');
const userRoutes = require('./routes/user');

// Import middleware
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
}));

// CORS configuration
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
    max: process.env.RATE_LIMIT_MAX || 100,
    message: {
        success: false,
        error: 'Too many requests, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to all routes
app.use('/api', limiter);

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later.',
    },
});
// Removed global authLimiter on /api/auth to prevent /auth/me rate limiting

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logger
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Static files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/multimodal', multimodalRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/user', userRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'AI Productivity API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found',
    });
});

// Global error handler
app.use(errorHandler);

module.exports = app;