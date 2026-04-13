"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractMedicineFromImage = extractMedicineFromImage;
const path_1 = __importDefault(require("path"));
const ocrProvider_1 = require("./ocrProvider");
const parseExtractedText_1 = require("../../utils/parseExtractedText");
const medicineEnrichment_1 = require("../ai/medicineEnrichment");
async function extractMedicineFromImage(filePath) {
    const fileExt = path_1.default.extname(filePath).toLowerCase();
    if (!fileExt) {
        // eslint-disable-next-line no-console
        console.warn('Extracting medicine without file extension');
    }
    const ocrText = await (0, ocrProvider_1.runOCR)(filePath);
    const parsed = (0, parseExtractedText_1.parseExtractedMedicineText)(ocrText);
    const { enriched, provider, profileMarkdown } = await (0, medicineEnrichment_1.enrichMedicineWithLLM)(ocrText, parsed);
    return { extracted: enriched, ocrText, provider, profileMarkdown };
}
