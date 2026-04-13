"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareImageForOcr = prepareImageForOcr;
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
function maxWidth() {
    const raw = process.env.OCR_MAX_IMAGE_WIDTH ?? '1600';
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 400 ? n : 1600;
}
/**
 * Downscale wide photos before OCR so Tesseract / Vision process fewer pixels (major latency win).
 * On failure, callers should fall back to the original path.
 */
async function prepareImageForOcr(filePath) {
    const abs = path_1.default.isAbsolute(filePath) ? filePath : path_1.default.join(process.cwd(), filePath);
    const mw = maxWidth();
    let meta;
    try {
        meta = await (0, sharp_1.default)(abs).metadata();
    }
    catch {
        return { path: abs, cleanup: async () => { } };
    }
    const w = meta.width ?? 0;
    if (w > 0 && w <= mw) {
        return { path: abs, cleanup: async () => { } };
    }
    const tmp = path_1.default.join(os_1.default.tmpdir(), `ocr_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`);
    await (0, sharp_1.default)(abs)
        .rotate()
        .resize({ width: mw, withoutEnlargement: true })
        .jpeg({ quality: 88, mozjpeg: true })
        .toFile(tmp);
    return {
        path: tmp,
        cleanup: async () => {
            try {
                await promises_1.default.unlink(tmp);
            }
            catch {
                /* ignore */
            }
        },
    };
}
