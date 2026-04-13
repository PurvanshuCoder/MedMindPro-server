"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ocrRouter = void 0;
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const auth_1 = require("../middleware/auth");
const extractMedicine_1 = require("../services/ocr/extractMedicine");
const router = express_1.default.Router();
const uploadDir = path_1.default.join(process.cwd(), 'uploads');
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname) || '.jpg';
        const name = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
        cb(null, name);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/'))
            return cb(new Error('Only image uploads are allowed'));
        cb(null, true);
    },
});
function publicBaseUrl() {
    return process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000';
}
router.post('/extract', auth_1.requireAuth, upload.single('image'), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ message: 'Missing image file.' });
        const filePath = req.file.path;
        const { extracted, provider, profileMarkdown, ocrText } = await (0, extractMedicine_1.extractMedicineFromImage)(filePath);
        const imageUrl = `${publicBaseUrl()}/uploads/${encodeURIComponent(req.file.filename)}`;
        return res.json({ extracted, imageUrl, provider, profileMarkdown, ocrText });
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'OCR extraction failed.';
        return res.status(500).json({ message });
    }
});
exports.ocrRouter = router;
