const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class Helpers {
    // Generate random string
    static generateRandomString(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Generate slug from text
    static generateSlug(text) {
        return text
            .toLowerCase()
            .replace(/[^\w ]+/g, '')
            .replace(/ +/g, '-');
    }

    // Format file size
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Parse markdown to plain text
    static markdownToText(markdown) {
        return markdown
            .replace(/#{1,6}\s/g, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/\*(.*?)\*/g, '$1')
            .replace(/`{1,3}.*?`{1,3}/g, '')
            .replace(/\[(.*?)\]\(.*?\)/g, '$1')
            .replace(/!\[(.*?)\]\(.*?\)/g, '$1')
            .replace(/\n{2,}/g, '\n')
            .trim();
    }

    // Extract code blocks from markdown
    static extractCodeBlocks(markdown) {
        const codeBlocks = [];
        const regex = /```(\w+)?\n([\s\S]*?)```/g;
        let match;
        
        while ((match = regex.exec(markdown)) !== null) {
            codeBlocks.push({
                language: match[1] || 'plaintext',
                code: match[2].trim(),
            });
        }
        
        return codeBlocks;
    }

    // Clean up old files
    static async cleanupOldFiles(directory, maxAge = 7 * 24 * 60 * 60 * 1000) {
        try {
            const files = fs.readdirSync(directory);
            const now = Date.now();

            for (const file of files) {
                const filePath = path.join(directory, file);
                const stats = fs.statSync(filePath);
                const age = now - stats.mtimeMs;

                if (age > maxAge) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted old file: ${file}`);
                }
            }
        } catch (error) {
            console.error('Error cleaning up files:', error);
        }
    }

    // Sanitize user input
    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    }

    // Truncate text with ellipsis
    static truncateText(text, maxLength = 100) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }

    // Get file extension
    static getFileExtension(filename) {
        return path.extname(filename).toLowerCase();
    }

    // Check if string is valid JSON
    static isValidJSON(str) {
        try {
            JSON.parse(str);
            return true;
        } catch (e) {
            return false;
        }
    }

    // Delay function
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Retry function with exponential backoff
    static async retry(fn, retries = 3, delay = 1000) {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error) {
                if (i === retries - 1) throw error;
                await this.delay(delay * Math.pow(2, i));
            }
        }
    }
}

module.exports = Helpers;