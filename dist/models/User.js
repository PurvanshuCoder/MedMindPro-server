"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const userSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    timezone: { type: String, default: 'UTC' },
    notificationEmail: { type: String, default: '' },
    /** E.164, e.g. +15551234567 (omit until set — avoids empty unique collisions) */
    phone: { type: String, trim: true },
    phoneVerified: { type: Boolean, default: false },
    whatsappNumber: { type: String, default: '' },
    authOtpHash: { type: String, default: '', select: false },
    authOtpExpires: { type: Date, select: false },
    /** register | login */
    authOtpPurpose: { type: String, default: '', select: false },
    otpLastSentAt: { type: Date },
    channels: {
        emailEnabled: { type: Boolean, default: true },
        whatsappEnabled: { type: Boolean, default: false },
    },
}, { timestamps: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
exports.UserModel = mongoose_1.default.model('User', userSchema);
