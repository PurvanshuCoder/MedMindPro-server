"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wallClockInTimeZone = wallClockInTimeZone;
exports.startNotificationScheduler = startNotificationScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const Medicine_1 = require("../../models/Medicine");
const NotificationLog_1 = require("../../models/NotificationLog");
const sender_1 = require("./sender");
let started = false;
/** Current wall-clock HH:mm and YYYY-MM-DD in the given IANA timezone (production-safe vs server-local only). */
function wallClockInTimeZone(date, timeZone) {
    const tz = timeZone?.trim() || 'UTC';
    try {
        const dtf = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        const parts = dtf.formatToParts(date);
        const map = {};
        for (const p of parts) {
            if (p.type !== 'literal')
                map[p.type] = p.value;
        }
        const hour = (map.hour ?? '00').padStart(2, '0');
        const minute = (map.minute ?? '00').padStart(2, '0');
        const year = map.year ?? '1970';
        const month = (map.month ?? '01').padStart(2, '0');
        const day = (map.day ?? '01').padStart(2, '0');
        return { time: `${hour}:${minute}`, dateKey: `${year}-${month}-${day}` };
    }
    catch {
        const d = date;
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        const yyyy = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return { time: `${hh}:${mm}`, dateKey: `${yyyy}-${month}-${day}` };
    }
}
function startNotificationScheduler() {
    if (started)
        return;
    started = true;
    let inFlight = false;
    node_cron_1.default.schedule('* * * * *', async () => {
        if (inFlight)
            return;
        inFlight = true;
        try {
            const now = new Date();
            const medicines = await Medicine_1.MedicineModel.find({
                'reminders.enabled': true,
                'reminders.times.0': { $exists: true },
            }).populate('owner');
            for (const med of medicines) {
                const user = med.owner;
                if (!user)
                    continue;
                const tz = typeof user.timezone === 'string' && user.timezone.trim()
                    ? user.timezone.trim()
                    : 'UTC';
                const { time: nowTime, dateKey: nowDateKey } = wallClockInTimeZone(now, tz);
                const times = med.reminders?.times ?? [];
                if (!times.includes(nowTime))
                    continue;
                if (user.channels?.emailEnabled) {
                    const existing = await NotificationLog_1.NotificationLogModel.findOne({
                        userId: user._id,
                        medicineId: med._id,
                        time: nowTime,
                        dateKey: nowDateKey,
                        channel: 'email',
                    });
                    if (!existing) {
                        await (0, sender_1.sendReminderEmail)(user, med).catch(() => undefined);
                        await NotificationLog_1.NotificationLogModel.create({
                            userId: user._id,
                            medicineId: med._id,
                            time: nowTime,
                            dateKey: nowDateKey,
                            channel: 'email',
                        }).catch(() => undefined);
                    }
                }
                if (user.channels?.whatsappEnabled) {
                    const existingWa = await NotificationLog_1.NotificationLogModel.findOne({
                        userId: user._id,
                        medicineId: med._id,
                        time: nowTime,
                        dateKey: nowDateKey,
                        channel: 'whatsapp',
                    });
                    if (!existingWa) {
                        try {
                            const wa = await (0, sender_1.sendReminderWhatsApp)(user, med);
                            if (wa && 'sent' in wa && wa.sent) {
                                await NotificationLog_1.NotificationLogModel.create({
                                    userId: user._id,
                                    medicineId: med._id,
                                    time: nowTime,
                                    dateKey: nowDateKey,
                                    channel: 'whatsapp',
                                }).catch(() => undefined);
                            }
                        }
                        catch (err) {
                            // eslint-disable-next-line no-console
                            console.error('[MedMind scheduler] WhatsApp reminder failed:', err);
                        }
                    }
                }
            }
        }
        finally {
            inFlight = false;
        }
    });
}
