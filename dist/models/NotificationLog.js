"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationLogModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const notificationLogSchema = new mongoose_1.default.Schema({
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true },
    medicineId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Medicine', required: true },
    time: { type: String, required: true }, // "HH:mm"
    dateKey: { type: String, required: true }, // "YYYY-MM-DD"
    channel: { type: String, default: 'email' },
    sentAt: { type: Date, default: () => new Date() },
}, { timestamps: true });
notificationLogSchema.index({ userId: 1, medicineId: 1, time: 1, dateKey: 1, channel: 1 }, { unique: true });
exports.NotificationLogModel = mongoose_1.default.model('NotificationLog', notificationLogSchema);
