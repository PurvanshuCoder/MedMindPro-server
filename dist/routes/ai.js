"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRouter = void 0;
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const medicineEnrichment_1 = require("../services/ai/medicineEnrichment");
const Medicine_1 = require("../models/Medicine");
const router = express_1.default.Router();
router.get('/status', (_req, res) => {
    const provider = (0, medicineEnrichment_1.getConfiguredAiProvider)();
    return res.json({
        configured: Boolean(provider),
        provider: provider ?? null,
    });
});
router.post('/insights', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const medicines = await Medicine_1.MedicineModel.find({ owner: userId })
            .select('name dosage frequency instructions reminders')
            .lean();
        const payload = medicines.map((m) => ({
            name: m.name,
            dosage: m.dosage ?? '—',
            frequency: m.frequency ?? '',
            instructions: m.instructions ?? '',
            reminders: m.reminders ?? { enabled: false, times: [] },
        }));
        const { markdown, provider } = await (0, medicineEnrichment_1.generateAdherenceInsights)(payload);
        return res.json({ markdown, provider });
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'AI insights failed.';
        return res.status(500).json({ message });
    }
});
router.post('/chat', auth_1.requireAuth, async (req, res) => {
    try {
        const body = req.body;
        const ocrText = (body.ocrText ?? '').toString();
        if (!ocrText) {
            return res.status(400).json({ message: 'Missing ocrText' });
        }
        const currentDraft = body.currentDraft ?? {};
        const current = {
            name: (currentDraft.name ?? '').toString() || 'Medicine',
            dosage: (currentDraft.dosage ?? '').toString() || '—',
            frequency: (currentDraft.frequency ?? '').toString() || 'Once daily',
            instructions: (currentDraft.instructions ?? '').toString(),
            description: (currentDraft.description ?? '').toString(),
            sideEffects: (currentDraft.sideEffects ?? '').toString(),
            precautions: (currentDraft.precautions ?? '').toString(),
        };
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const { enriched, provider, profileMarkdown } = await (0, medicineEnrichment_1.chatEnrichWithLLM)(ocrText, current, messages);
        return res.json({
            updatedDraft: enriched,
            profileMarkdown,
            provider,
        });
    }
    catch (e) {
        const message = e instanceof Error ? e.message : 'AI chat failed.';
        return res.status(500).json({ message });
    }
});
exports.aiRouter = router;
