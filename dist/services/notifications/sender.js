"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildImmediateReminderSavedMessage = buildImmediateReminderSavedMessage;
exports.sendReminderEmail = sendReminderEmail;
exports.sendReminderWhatsApp = sendReminderWhatsApp;
exports.sendWhatsAppText = sendWhatsAppText;
const nodemailer_1 = __importDefault(require("nodemailer"));
const whatsappWebClient_1 = require("../whatsapp/whatsappWebClient");
function normalizeTimeMessage(medicine) {
    return `Time to take your medicine: ${medicine.name}\nDosage: ${medicine.dosage}`;
}
function buildImmediateReminderSavedMessage(medicineName, dosage, timesCsv) {
    return (`MedMind · Reminders saved (instant confirmation)\n` +
        `Medicine: ${medicineName}\n` +
        `Dosage: ${dosage}\n` +
        `Scheduled times: ${timesCsv}\n` +
        `You will get another WhatsApp at each scheduled time when it is due.`);
}
async function sendReminderEmail(user, medicine) {
    const from = process.env.EMAIL_FROM ?? '';
    const host = process.env.SMTP_HOST ?? '';
    const port = Number(process.env.SMTP_PORT ?? 587);
    const smtpUser = process.env.SMTP_USER ?? '';
    const smtpPass = process.env.SMTP_PASS ?? '';
    if (!from || !host || !smtpUser || !smtpPass) {
        // eslint-disable-next-line no-console
        console.warn('Email env is not configured; skipping email notification.');
        return { skipped: true };
    }
    const to = user.notificationEmail || user.email;
    const transporter = nodemailer_1.default.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
        from,
        to,
        subject: `Medicine reminder: ${medicine.name}`,
        text: normalizeTimeMessage(medicine),
    });
    return { sent: true };
}
async function sendReminderWhatsApp(user, medicine) {
    if (process.env.WHATSAPP_WEB_ENABLED !== 'true') {
        // eslint-disable-next-line no-console
        console.warn('WHATSAPP_WEB_ENABLED is not true; skipping WhatsApp reminder.');
        return { skipped: true };
    }
    const chatId = (0, whatsappWebClient_1.toWhatsAppWebChatId)(user.whatsappNumber ?? '');
    if (!chatId) {
        // eslint-disable-next-line no-console
        console.warn('User whatsappNumber missing or invalid; skipping WhatsApp.');
        return { skipped: true };
    }
    return (0, whatsappWebClient_1.sendViaWhatsAppWeb)(chatId, normalizeTimeMessage(medicine));
}
/** Transactional WhatsApp (immediate confirmation when user saves reminders, etc.). */
async function sendWhatsAppText(user, text) {
    if (process.env.WHATSAPP_WEB_ENABLED !== 'true') {
        // eslint-disable-next-line no-console
        console.warn('WHATSAPP_WEB_ENABLED is not true; skipping WhatsApp message.');
        return { skipped: true };
    }
    const chatId = (0, whatsappWebClient_1.toWhatsAppWebChatId)(user.whatsappNumber ?? '');
    if (!chatId) {
        // eslint-disable-next-line no-console
        console.warn('User whatsappNumber missing or invalid; skipping WhatsApp message.');
        return { skipped: true };
    }
    return (0, whatsappWebClient_1.sendViaWhatsAppWeb)(chatId, text);
}
