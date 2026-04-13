"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MedicineModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const reminderSchema = new mongoose_1.default.Schema({
    enabled: { type: Boolean, default: true },
    times: { type: [String], default: ['08:00'] },
}, { _id: false });
const medicineSchema = new mongoose_1.default.Schema({
    owner: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    dosage: { type: String, default: '—' },
    frequency: { type: String, default: '' },
    instructions: { type: String, default: '' },
    description: { type: String, default: '' },
    sideEffects: { type: String, default: '' },
    precautions: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    reminders: { type: reminderSchema, default: () => ({ enabled: true, times: ['08:00'] }) },
}, { timestamps: true });
exports.MedicineModel = mongoose_1.default.model('Medicine', medicineSchema);
