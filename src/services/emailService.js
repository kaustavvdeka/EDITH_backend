const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_PORT === '465',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }

    async sendEmail({ to, subject, html }) {
        try {
            const mailOptions = {
                from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
                to,
                subject,
                html,
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('Email sent:', info.messageId);
            return info;
        } catch (error) {
            console.error('Error sending email:', error);
            throw error;
        }
    }

    async sendVerificationEmail(email, token) {
        const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email/${token}`;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Welcome to AI Productivity Platform!</h2>
                <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
                <a href="${verificationUrl}" 
                   style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">
                    Verify Email
                </a>
                <p>Or copy and paste this link in your browser:</p>
                <p>${verificationUrl}</p>
                <p>This link will expire in 24 hours.</p>
                <p>If you didn't create an account, please ignore this email.</p>
            </div>
        `;

        await this.sendEmail({
            to: email,
            subject: 'Verify Your Email - AI Productivity Platform',
            html,
        });
    }

    async sendPasswordResetEmail(email, token) {
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${token}`;
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">Password Reset Request</h2>
                <p>You requested a password reset. Click the button below to reset your password:</p>
                <a href="${resetUrl}" 
                   style="display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px;">
                    Reset Password
                </a>
                <p>Or copy and paste this link in your browser:</p>
                <p>${resetUrl}</p>
                <p>This link will expire in 1 hour.</p>
                <p>If you didn't request this, please ignore this email.</p>
            </div>
        `;

        await this.sendEmail({
            to: email,
            subject: 'Password Reset - AI Productivity Platform',
            html,
        });
    }
}

module.exports = new EmailService();