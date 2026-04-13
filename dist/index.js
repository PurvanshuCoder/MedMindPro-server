"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const express_1 = __importDefault(require("express"));
const app_1 = require("./app");
const scheduler_1 = require("./services/notifications/scheduler");
const whatsappWebClient_1 = require("./services/whatsapp/whatsappWebClient");
dotenv_1.default.config();
const PORT = Number(process.env.PORT ?? 4000);
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
if (!MONGO_URI)
    throw new Error('Missing MONGO_URI in environment.');
if (!JWT_SECRET)
    throw new Error('Missing JWT_SECRET in environment.');
async function main() {
    const uploadDir = path_1.default.join(process.cwd(), 'uploads');
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
    const app = (0, app_1.createApp)();
    app.use('/uploads', express_1.default.static(uploadDir));
    await mongoose_1.default.connect(MONGO_URI);
    // eslint-disable-next-line no-console
    console.log('MongoDB connected.');
    (0, scheduler_1.startNotificationScheduler)();
    (0, whatsappWebClient_1.initWhatsAppWeb)();
    app.listen(PORT, '0.0.0.0', () => {
        // eslint-disable-next-line no-console
        console.log(`API listening on http://localhost:${PORT}`);
    });
}
main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err);
    process.exit(1);
});
