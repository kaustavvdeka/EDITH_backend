const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - Authentication middleware
const protect = async (req, res, next) => {
    try {
        let token;

        // Get token from Authorization header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Not authorized to access this route',
            });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from database
            const user = await User.findById(decoded.id);
            
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'User not found',
                });
            }

            // Check if user is active/verified
            if (!user.isVerified) {
                return res.status(401).json({
                    success: false,
                    error: 'Please verify your email address',
                });
            }

            // Attach user to request object
            req.user = user;
            next();
        } catch (error) {
            return res.status(401).json({
                success: false,
                error: 'Not authorized to access this route',
            });
        }
    } catch (error) {
        next(error);
    }
};

// Authorize by role
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `User role ${req.user.role} is not authorized to access this route`,
            });
        }
        next();
    };
};

// Optional auth - doesn't require authentication but attaches user if token present
const optionalAuth = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.user = await User.findById(decoded.id);
            } catch (error) {
                // Token invalid or expired, but we don't throw error
                console.log('Optional auth: Invalid token');
            }
        }

        next();
    } catch (error) {
        next(error);
    }
};

// Generate JWT token with user ID
const generateToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE }
    );
};

// Generate refresh token
const generateRefreshToken = (userId) => {
    return jwt.sign(
        { id: userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRE }
    );
};

module.exports = {
    protect,
    authorize,
    optionalAuth,
    generateToken,
    generateRefreshToken,
};