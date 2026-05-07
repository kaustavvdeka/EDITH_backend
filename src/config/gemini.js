const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

const initializeGemini = () => {
    try {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not configured');
        }

        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        console.log('✅ Gemini AI initialized successfully');
        return genAI;
    } catch (error) {
        console.error('❌ Failed to initialize Gemini AI:', error.message);
        throw error;
    }
};

const getGeminiModel = (modelName = 'gemini-pro') => {
    if (!genAI) {
        initializeGemini();
    }
    
    try {
        return genAI.getGenerativeModel({ model: modelName });
    } catch (error) {
        console.error('❌ Failed to get Gemini model:', error.message);
        throw error;
    }
};

const getGeminiVisionModel = () => {
    if (!genAI) {
        initializeGemini();
    }
    
    try {
        return genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
    } catch (error) {
        console.error('❌ Failed to get Gemini Vision model:', error.message);
        throw error;
    }
};

module.exports = {
    initializeGemini,
    getGeminiModel,
    getGeminiVisionModel,
};