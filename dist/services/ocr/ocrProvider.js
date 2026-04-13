"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runOCR = runOCR;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const tesseract_js_1 = require("tesseract.js");
let workerPromise = null;
let ocrInitPromise = null;
async function getWorker() {
    if (!workerPromise)
        workerPromise = Promise.resolve((0, tesseract_js_1.createWorker)('eng'));
    return workerPromise;
}
async function initTesseract() {
    if (!ocrInitPromise) {
        ocrInitPromise = (async () => {
            const worker = await getWorker();
            // The API surface differs slightly across tesseract versions; keep it permissive.
            await worker.load?.();
            await worker.loadLanguage?.('eng');
            await worker.initialize?.('eng');
        })();
    }
    return ocrInitPromise;
}
async function ocrWithTesseract(filePath) {
    await initTesseract();
    const worker = await getWorker();
    const { data } = await worker.recognize(filePath);
    return data.text ?? '';
}
async function ocrWithGoogleVision(filePath) {
    const apiKey = process.env.GOOGLE_VISION_API_KEY ?? '';
    if (!apiKey)
        throw new Error('GOOGLE_VISION_API_KEY is not set.');
    const abs = path_1.default.isAbsolute(filePath) ? filePath : path_1.default.join(process.cwd(), filePath);
    const base64 = fs_1.default.readFileSync(abs, { encoding: 'base64' });
    const resp = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            requests: [
                {
                    image: { content: base64 },
                    features: [{ type: 'TEXT_DETECTION' }],
                },
            ],
        }),
    });
    if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Google Vision failed: ${resp.status} ${txt}`);
    }
    const data = (await resp.json());
    const annotation = data?.responses?.[0]?.fullTextAnnotation?.text;
    return typeof annotation === 'string' ? annotation : '';
}
async function runOCR(filePath) {
    const provider = (process.env.OCR_PROVIDER ?? 'google').toLowerCase();
    // Default to Google Vision to match project configuration.
    // If you explicitly set OCR_PROVIDER=tesseract, we'll use local Tesseract instead.
    if (provider === 'tesseract')
        return ocrWithTesseract(filePath);
    // Otherwise, use Google Vision (requires GOOGLE_VISION_API_KEY).
    return ocrWithGoogleVision(filePath);
}
