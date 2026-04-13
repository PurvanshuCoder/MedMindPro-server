"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const auth_1 = require("./routes/auth");
const medicines_1 = require("./routes/medicines");
const ocr_1 = require("./routes/ocr");
const ai_1 = require("./routes/ai");
function createApp() {
    const app = (0, express_1.default)();
    app.use((0, helmet_1.default)());
    const corsOrigins = process.env.CORS_ORIGINS?.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const corsMw = (0, cors_1.default)({
        origin: corsOrigins?.length ? corsOrigins : true,
        credentials: true,
        methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        optionsSuccessStatus: 204,
    });
    app.use(corsMw);
    app.options('*', corsMw);
    app.use(express_1.default.json({ limit: '2mb' }));
    app.use((0, morgan_1.default)('dev'));
    app.get('/health', (_req, res) => res.json({ ok: true }));
    app.use('/api/auth', auth_1.authRouter);
    app.use('/api/medicines', medicines_1.medicinesRouter);
    app.use('/api/ocr', ocr_1.ocrRouter);
    app.use('/api/ai', ai_1.aiRouter);
    return app;
}
