"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.toWhatsAppWebChatId = toWhatsAppWebChatId;
exports.initWhatsAppWeb = initWhatsAppWeb;
exports.sendViaWhatsAppWeb = sendViaWhatsAppWeb;
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const whatsapp_web_js_1 = require("whatsapp-web.js");
const { MongoStore } = require('wwebjs-mongo');
let client = null;
let ready = false;
let started = false;
function buildAuthStrategy() {
    const remoteEnabled = process.env.WWEBJS_REMOTE_AUTH_ENABLED !== 'false';
    if (remoteEnabled) {
        const sessionName = process.env.WWEBJS_SESSION_NAME?.trim() || 'medmind-main';
        const backupSyncIntervalMs = Number(process.env.WWEBJS_REMOTE_BACKUP_MS ?? 300000);
        // Requires Mongo to already be connected; index.ts does this before initWhatsAppWeb().
        const store = new MongoStore({ mongoose: mongoose_1.default });
        // eslint-disable-next-line no-console
        console.log(`[WhatsApp Web] Using RemoteAuth session "${sessionName}".`);
        return new whatsapp_web_js_1.RemoteAuth({
            store,
            clientId: sessionName,
            backupSyncIntervalMs,
        });
    }
    const dataPath = process.env.WWEBJS_AUTH_PATH?.trim() ||
        path_1.default.join(process.cwd(), '.wwebjs_auth');
    // eslint-disable-next-line no-console
    console.log(`[WhatsApp Web] Using LocalAuth at ${dataPath}.`);
    return new whatsapp_web_js_1.LocalAuth({ dataPath });
}
/** E.164 or whatsapp:+… or digits → WhatsApp Web chat id (e.g. 12025551234@c.us). */
function toWhatsAppWebChatId(raw) {
    const t = raw.replace(/\s/g, '').trim();
    if (!t)
        return null;
    const withoutPrefix = t.replace(/^whatsapp:/i, '');
    const digits = withoutPrefix.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15)
        return null;
    return `${digits}@c.us`;
}
function initWhatsAppWeb() {
    if (process.env.WHATSAPP_WEB_ENABLED !== 'true')
        return;
    if (started)
        return;
    started = true;
    client = new whatsapp_web_js_1.Client({
        authStrategy: buildAuthStrategy(),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    });
    client.on('qr', (qr) => {
        // eslint-disable-next-line no-console
        console.log('\n[WhatsApp Web] Scan this QR with WhatsApp → Linked devices:\n');
        qrcode_terminal_1.default.generate(qr, { small: true });
        // eslint-disable-next-line no-console
        console.log('');
    });
    client.on('ready', () => {
        ready = true;
        // eslint-disable-next-line no-console
        console.log('[WhatsApp Web] Client ready — reminder messages can be sent.');
    });
    client.on('authenticated', () => {
        // eslint-disable-next-line no-console
        console.log('[WhatsApp Web] Authenticated.');
    });
    client.on('auth_failure', (msg) => {
        ready = false;
        // eslint-disable-next-line no-console
        console.error('[WhatsApp Web] Auth failure:', msg);
    });
    client.on('disconnected', (reason) => {
        ready = false;
        // eslint-disable-next-line no-console
        console.warn('[WhatsApp Web] Disconnected:', reason);
    });
    client.initialize().catch((err) => {
        ready = false;
        // eslint-disable-next-line no-console
        console.error('[WhatsApp Web] Failed to initialize:', err);
    });
}
async function sendViaWhatsAppWeb(chatId, text) {
    if (!client || !ready) {
        // eslint-disable-next-line no-console
        console.warn('[WhatsApp Web] Not ready (scan QR if needed); skipping WhatsApp send.');
        return { skipped: true };
    }
    try {
        await client.sendMessage(chatId, text);
        return { sent: true };
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.error('[WhatsApp Web] sendMessage failed:', err);
        return { skipped: true };
    }
}
