"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.medicinesRouter = void 0;
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = require("../middleware/auth");
const Medicine_1 = require("../models/Medicine");
const User_1 = require("../models/User");
const sender_1 = require("../services/notifications/sender");
const router = express_1.default.Router();
function parseTimes(times) {
    if (!Array.isArray(times))
        return [];
    const out = [];
    for (const t of times) {
        if (typeof t !== 'string')
            continue;
        if (/^\d{2}:\d{2}$/.test(t))
            out.push(t);
    }
    return out;
}
router.get('/', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const medicines = await Medicine_1.MedicineModel.find({ owner: userId }).sort({ createdAt: -1 });
        return res.json({ medicines });
    }
    catch {
        return res.status(500).json({ message: 'Failed to load medicines' });
    }
});
router.post('/', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const body = req.body;
        const name = (body.name ?? '').toString().trim();
        if (!name)
            return res.status(400).json({ message: 'Medicine name is required' });
        const reminders = body.reminders ?? { enabled: true, times: ['08:00'] };
        const nextReminders = {
            enabled: Boolean(reminders.enabled),
            times: parseTimes(reminders.times),
        };
        if (nextReminders.times.length === 0)
            nextReminders.times = ['08:00'];
        const created = await Medicine_1.MedicineModel.create({
            owner: new mongoose_1.default.Types.ObjectId(userId),
            name,
            dosage: (body.dosage ?? '—').toString(),
            frequency: (body.frequency ?? '').toString(),
            instructions: (body.instructions ?? '').toString(),
            description: (body.description ?? '').toString(),
            sideEffects: (body.sideEffects ?? '').toString(),
            precautions: (body.precautions ?? '').toString(),
            imageUrl: (body.imageUrl ?? '').toString(),
            reminders: nextReminders,
        });
        const owner = await User_1.UserModel.findById(userId);
        if (owner?.whatsappNumber && nextReminders.enabled) {
            owner.channels = owner.channels ?? { emailEnabled: true, whatsappEnabled: false };
            owner.channels.whatsappEnabled = true;
            await owner.save();
            const times = nextReminders.times.join(', ');
            try {
                const r = await (0, sender_1.sendWhatsAppText)(owner, (0, sender_1.buildImmediateReminderSavedMessage)(created.name, created.dosage, times));
                if (r && 'skipped' in r && r.skipped) {
                    // eslint-disable-next-line no-console
                    console.warn('[MedMind] Immediate WhatsApp skipped after medicine create (env/number)');
                }
            }
            catch (e) {
                // eslint-disable-next-line no-console
                console.error('[MedMind] Immediate WhatsApp failed after medicine create:', e);
            }
        }
        return res.status(201).json({ medicine: created });
    }
    catch {
        return res.status(500).json({ message: 'Failed to create medicine' });
    }
});
router.patch('/:id/reminders', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const id = req.params.id;
        if (!mongoose_1.default.isValidObjectId(id))
            return res.status(400).json({ message: 'Invalid id' });
        const body = req.body;
        const nextReminders = {
            enabled: Boolean(body.enabled),
            times: parseTimes(body.times),
        };
        if (nextReminders.times.length === 0)
            nextReminders.times = ['08:00'];
        const updated = await Medicine_1.MedicineModel.findOneAndUpdate({ _id: id, owner: userId }, { reminders: nextReminders }, { new: true });
        if (!updated)
            return res.status(404).json({ message: 'Medicine not found' });
        const owner = await User_1.UserModel.findById(userId);
        if (owner?.whatsappNumber && nextReminders.enabled) {
            owner.channels = owner.channels ?? { emailEnabled: true, whatsappEnabled: false };
            owner.channels.whatsappEnabled = true;
            await owner.save();
            const times = nextReminders.times.join(', ');
            try {
                const r = await (0, sender_1.sendWhatsAppText)(owner, (0, sender_1.buildImmediateReminderSavedMessage)(updated.name, updated.dosage, times));
                if (r && 'skipped' in r && r.skipped) {
                    // eslint-disable-next-line no-console
                    console.warn('[MedMind] Immediate WhatsApp skipped after reminder save (env/number)');
                }
            }
            catch (e) {
                // eslint-disable-next-line no-console
                console.error('[MedMind] Immediate WhatsApp failed after reminder save:', e);
            }
        }
        return res.json({ medicine: updated });
    }
    catch {
        return res.status(500).json({ message: 'Failed to update reminders' });
    }
});
router.delete('/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const id = req.params.id;
        if (!mongoose_1.default.isValidObjectId(id))
            return res.status(400).json({ message: 'Invalid id' });
        const deleted = await Medicine_1.MedicineModel.findOneAndDelete({ _id: id, owner: userId });
        if (!deleted)
            return res.status(404).json({ message: 'Medicine not found' });
        return res.json({ ok: true });
    }
    catch {
        return res.status(500).json({ message: 'Failed to delete medicine' });
    }
});
exports.medicinesRouter = router;
