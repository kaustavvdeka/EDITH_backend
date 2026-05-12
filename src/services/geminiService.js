const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const { AppError } = require('../middleware/errorHandler');

class GeminiService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.textModel = null;
        this.visionModel = null;
        this.initializeModels();
    }

    initializeModels() {
        try {
            this.textModel = this.genAI.getGenerativeModel({ 
                model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.8,
                    topK: 40,
                    maxOutputTokens: 4096,
                },
            });
            
            this.visionModel = this.genAI.getGenerativeModel({ 
                model: process.env.GEMINI_VISION_MODEL || "gemini-2.5-flash-lite",
                generationConfig: {
                    temperature: 0.4,
                    topP: 0.8,
                    topK: 40,
                    maxOutputTokens: 2048,
                },
            });
            
            console.log('✅ Gemini models initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Gemini models:', error);
            throw error;
        }
    }

    // Truncate chat history to avoid exceeding token limits
    // Keeps the last N messages plus an optional system summary
    truncateHistory(chatHistory, maxMessages = 20) {
        if (chatHistory.length <= maxMessages) return chatHistory;
        return chatHistory.slice(-maxMessages);
    }

    // Text generation for chat
    async generateTextResponse(prompt, chatHistory = [], options = {}) {
        try {
            const startTime = Date.now();
            
            // Window the history to prevent token overflow
            const windowedHistory = this.truncateHistory(chatHistory);

            // Create chat instance
            const chat = this.textModel.startChat({
                history: windowedHistory.map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }],
                })),
                generationConfig: {
                    temperature: options.temperature || 0.7,
                    maxOutputTokens: options.maxTokens || 2048,
                },
            });

            const result = await chat.sendMessage(prompt);
            const response = await result.response;
            const text = response.text();
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            return {
                text,
                tokens: {
                    input: response.usageMetadata?.promptTokenCount || 0,
                    output: response.usageMetadata?.candidatesTokenCount || 0,
                    total: response.usageMetadata?.totalTokenCount || 0,
                },
                responseTime,
                model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
            };
        } catch (error) {
            console.error('Gemini text generation error:', error);
            throw new AppError('Failed to generate AI response. Please try again.', 500);
        }
    }

    // Streaming text generation for SSE-based chat
    async *streamTextResponse(prompt, chatHistory = [], options = {}) {
        try {
            // Window the history to prevent token overflow
            const windowedHistory = this.truncateHistory(chatHistory);

            const chat = this.textModel.startChat({
                history: windowedHistory.map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }],
                })),
                generationConfig: {
                    temperature: options.temperature || 0.7,
                    maxOutputTokens: options.maxTokens || 2048,
                },
            });

            const result = await chat.sendMessageStream(prompt);

            for await (const chunk of result.stream) {
                const text = chunk.text();
                if (text) {
                    yield { type: 'chunk', text };
                }
            }

            // Final aggregated response for metadata
            const aggregated = await result.response;
            yield {
                type: 'done',
                tokens: {
                    input: aggregated.usageMetadata?.promptTokenCount || 0,
                    output: aggregated.usageMetadata?.candidatesTokenCount || 0,
                    total: aggregated.usageMetadata?.totalTokenCount || 0,
                },
                model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
            };
        } catch (error) {
            console.error('Gemini streaming error:', error);
            throw new AppError('Failed to generate streaming AI response. Please try again.', 500);
        }
    }

    // Image analysis with Vision API
    async analyzeImage(imagePath, prompt = "Describe this image in detail.") {
        try {
            const startTime = Date.now();
            
            // Read image file or fetch from URL
            let imageBuffer;
            if (imagePath.startsWith('http')) {
                const response = await fetch(imagePath);
                const arrayBuffer = await response.arrayBuffer();
                imageBuffer = Buffer.from(arrayBuffer);
            } else {
                imageBuffer = fs.readFileSync(imagePath);
            }
            const mimeType = this.getMimeType(imagePath);

            // Prepare image part
            const imagePart = {
                inlineData: {
                    data: imageBuffer.toString('base64'),
                    mimeType: mimeType,
                },
            };

            // Generate content
            const result = await this.visionModel.generateContent([prompt, imagePart]);
            const response = await result.response;
            const text = response.text();
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            return {
                text,
                tokens: {
                    input: response.usageMetadata?.promptTokenCount || 0,
                    output: response.usageMetadata?.candidatesTokenCount || 0,
                    total: response.usageMetadata?.totalTokenCount || 0,
                },
                responseTime,
                model: "gemini-2.5-flash-lite",
            };
        } catch (error) {
            console.error('Gemini vision analysis error:', error);
            throw new AppError('Failed to analyze image. Please try again.', 500);
        }
    }

    // Multimodal processing (text + image)
    async multimodalProcess(textPrompt, imagePaths = [], documentContent = "") {
        try {
            const startTime = Date.now();
            
            // Build parts array for multimodal input
            const parts = [];
            
            // Add text prompt
            parts.push({ text: textPrompt });
            
            // Add images if provided
            for (const imagePath of imagePaths) {
                let imageBuffer;
                if (imagePath.startsWith('http')) {
                    const response = await fetch(imagePath);
                    const arrayBuffer = await response.arrayBuffer();
                    imageBuffer = Buffer.from(arrayBuffer);
                } else {
                    imageBuffer = fs.readFileSync(imagePath);
                }
                const mimeType = this.getMimeType(imagePath);
                
                parts.push({
                    inlineData: {
                        data: imageBuffer.toString('base64'),
                        mimeType: mimeType,
                    },
                });
            }
            
            // Add document content if provided
            if (documentContent) {
                parts.push({ text: `Document content: ${documentContent}` });
            }

            // Use vision model if images are present, otherwise use text model
            const model = imagePaths.length > 0 ? this.visionModel : this.textModel;
            const result = await model.generateContent(parts);
            const response = await result.response;
            const text = response.text();
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;

            return {
                text,
                tokens: {
                    input: response.usageMetadata?.promptTokenCount || 0,
                    output: response.usageMetadata?.candidatesTokenCount || 0,
                    total: response.usageMetadata?.totalTokenCount || 0,
                },
                responseTime,
                model: "gemini-2.5-flash-lite",
            };
        } catch (error) {
            console.error('Gemini multimodal processing error:', error);
            throw new AppError('Failed to process multimodal request. Please try again.', 500);
        }
    }

    // Code generation and debugging
    async generateCode(prompt, language, type = 'generation', existingCode = "") {
        try {
            let systemPrompt = "";
            
            switch (type) {
                case 'generation':
                    systemPrompt = `You are an expert ${language} developer. Generate clean, well-documented ${language} code based on the following requirements. Include comments explaining key parts of the code. Format the code properly with appropriate indentation.

Requirements: ${prompt}
`;
                    break;
                    
                case 'debugging':
                    systemPrompt = `You are an expert ${language} developer. Debug the following code and provide:
1. Identified issues
2. Fixed code
3. Explanation of fixes

Existing Code:
\`\`\`${language}
${existingCode}
\`\`\`

Debug Request: ${prompt}`;
                    break;
                    
                case 'explanation':
                    systemPrompt = `You are an expert ${language} developer. Explain the following code line by line in detail:

Code:
\`\`\`${language}
${existingCode}
\`\`\`

${prompt ? `Additionally: ${prompt}` : ''}`;
                    break;
                    
                default:
                    systemPrompt = prompt;
            }

            const result = await this.generateTextResponse(systemPrompt, [], {
                temperature: 0.3,
                maxTokens: 4096,
            });

            return result;
        } catch (error) {
            console.error('Gemini code generation error:', error);
            throw new AppError('Failed to generate code. Please try again.', 500);
        }
    }

    // Document summarization
    async summarizeDocument(content, type = 'comprehensive') {
        try {
            let prompt = "";
            
            switch (type) {
                case 'short':
                    prompt = `Provide a brief 2-3 sentence summary of the following content:\n\n${content}`;
                    break;
                    
                case 'bullets':
                    prompt = `Provide a bullet-point summary of the following content. Include key points, main ideas, and important details as bullet points:\n\n${content}`;
                    break;
                    
                case 'key_points':
                    prompt = `Extract the key points from the following content and present them in a clear, organized manner:\n\n${content}`;
                    break;
                    
                case 'action_items':
                    prompt = `Analyze the following content and extract actionable items, tasks, and next steps:\n\n${content}`;
                    break;
                    
                default:
                    prompt = `Provide a comprehensive summary of the following content including:
1. Short Summary
2. Bullet Points
3. Key Points
4. Action Items (if applicable)

Content:\n\n${content}`;
            }

            const result = await this.generateTextResponse(prompt, [], {
                temperature: 0.3,
                maxTokens: 4096,
            });

            return {
                ...result,
                type,
            };
        } catch (error) {
            console.error('Gemini summarization error:', error);
            throw new AppError('Failed to summarize document. Please try again.', 500);
        }
    }

    // Helper to get MIME type from file extension
    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.pdf': 'application/pdf',
        };
        
        return mimeTypes[ext] || 'image/jpeg';
    }

    // Token counting utility
    async countTokens(text) {
        try {
            const result = await this.textModel.countTokens(text);
            return result.totalTokens || 0;
        } catch (error) {
            console.error('Token counting error:', error);
            return 0;
        }
    }
}

// Export singleton instance
module.exports = new GeminiService();