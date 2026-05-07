const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { AppError } = require('./errorHandler');

const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Cloudinary storage for images and multimodal
const cloudinaryStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const isImage = file.mimetype.startsWith('image/');
        return {
            folder: 'ai_productivity_platform',
            resource_type: isImage ? 'image' : 'raw',
            allowed_formats: isImage ? ['jpg', 'png', 'jpeg', 'gif', 'webp'] : ['pdf', 'txt'],
            public_id: `${uuidv4()}_${path.parse(file.originalname).name}`,
        };
    },
});

// Configure local storage (for documents etc)
const localStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = 'uploads/';
        
        // Determine subdirectory based on file type
        if (file.mimetype === 'application/pdf') {
            uploadPath += 'documents/';
        } else {
            uploadPath += 'others/';
        }
        
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Generate unique filename
        const uniqueId = uuidv4();
        const extension = path.extname(file.originalname);
        cb(null, `${uniqueId}${extension}`);
    },
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedDocTypes = ['application/pdf', 'text/plain'];
    const allAllowedTypes = [...allowedImageTypes, ...allowedDocTypes];

    if (allAllowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new AppError('Invalid file type. Only images (JPEG, PNG, GIF, WebP) and documents (PDF, TXT) are allowed.', 400), false);
    }
};

// Image upload configuration
const imageUpload = multer({
    storage: cloudinaryStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new AppError('Only image files are allowed (JPEG, PNG, GIF, WebP)', 400), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
});

// Document upload configuration
const documentUpload = multer({
    storage: localStorage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'text/plain'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new AppError('Only PDF and text files are allowed', 400), false);
        }
    },
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB
    },
});

// General upload configuration
const generalUpload = multer({
    storage: cloudinaryStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
    },
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('File too large. Maximum size is 10MB', 400));
        }
        return next(new AppError(err.message, 400));
    }
    next(err);
};

module.exports = {
    imageUpload,
    documentUpload,
    generalUpload,
    handleMulterError,
};