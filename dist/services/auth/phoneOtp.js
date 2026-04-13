"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RESEND_COOLDOWN_MS = exports.OTP_TTL_MS = void 0;
exports.normalizeE164 = normalizeE164;
exports.toWhatsAppAddress = toWhatsAppAddress;
exports.generateOtpDigits = generateOtpDigits;
exports.hashOtp = hashOtp;
exports.verifyOtpHash = verifyOtpHash;
exports.otpExpiresAt = otpExpiresAt;
exports.canResendOtp = canResendOtp;
exports.sendOtpSms = sendOtpSms;
exports.twilioSmsFailureHint = twilioSmsFailureHint;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const twilio_1 = require("twilio");
const OTP_TTL_MS = 10 * 60 * 1000;
exports.OTP_TTL_MS = OTP_TTL_MS;
const RESEND_COOLDOWN_MS = 60 * 1000;
exports.RESEND_COOLDOWN_MS = RESEND_COOLDOWN_MS;
/** Strip spaces/dashes; keep leading + and digits. */
function normalizeE164(phone) {
    const raw = phone.replace(/[\s()-]/g, '');
    if (!raw)
        return null;
    const withPlus = raw.startsWith('+') ? raw : `+${raw}`;
    if (!/^\+[1-9]\d{6,14}$/.test(withPlus))
        return null;
    return withPlus;
}
function toWhatsAppAddress(e164) {
    return `whatsapp:${e164}`;
}
function generateOtpDigits(length = 6) {
    let out = '';
    for (let i = 0; i < length; i++)
        out += String(crypto_1.default.randomInt(0, 10));
    return out;
}
async function hashOtp(code) {
    return bcryptjs_1.default.hash(code, 9);
}
async function verifyOtpHash(code, hash) {
    return bcryptjs_1.default.compare(code, hash);
}
function otpExpiresAt() {
    return new Date(Date.now() + OTP_TTL_MS);
}
function canResendOtp(lastSentAt) {
    if (!lastSentAt)
        return true;
    return Date.now() - lastSentAt.getTime() >= RESEND_COOLDOWN_MS;
}
function resolveTwilioSmsRoute() {
    const ms = process.env.TWILIO_MESSAGING_SERVICE_SID?.replace(/\s/g, '').trim();
    if (ms && /^MG[a-f0-9]{32}$/i.test(ms)) {
        return { kind: 'messagingService', messagingServiceSid: ms };
    }
    const candidates = [
        process.env.TWILIO_SMS_FROM,
        process.env.TWILIO_PHONE_NUMBER,
        process.env.TWILIO_FROM_NUMBER,
    ];
    const waRaw = process.env.TWILIO_FROM_WHATSAPP?.trim();
    if (waRaw) {
        const stripped = waRaw
            .replace(/^whatsapp:/i, '')
            .replace(/^sms:/i, '')
            .replace(/\s/g, '');
        if (stripped.startsWith('+'))
            candidates.push(stripped);
    }
    for (const c of candidates) {
        if (!c)
            continue;
        let n = c.replace(/\s/g, '').trim();
        n = n.replace(/^(whatsapp|sms):/i, '');
        if (n && /^\+[1-9]\d{6,14}$/.test(n)) {
            return { kind: 'fromNumber', from: n };
        }
    }
    return null;
}
async function sendOtpSms(toE164, code) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? '';
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? '';
    const to = toE164.replace(/\s/g, '');
    const body = `Your MedMind verification code is: ${code}. It expires in 10 minutes. Do not share this code.`;
    if (!accountSid || !authToken) {
        // eslint-disable-next-line no-console
        console.warn('[MedMind OTP] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing — SMS not sent. OTP:', code);
        return { ok: false, notConfigured: true };
    }
    const route = resolveTwilioSmsRoute();
    if (!route) {
        // eslint-disable-next-line no-console
        console.warn('[MedMind OTP] No SMS sender configured. Set one of:\n' +
            '  TWILIO_MESSAGING_SERVICE_SID=MG…\n' +
            '  TWILIO_SMS_FROM=+1… (your Twilio SMS number in E.164)\n' +
            '  or put the same E.164 in TWILIO_FROM_WHATSAPP (no spaces).\n' +
            'OTP for manual testing:', code);
        return { ok: false, notConfigured: true };
    }
    try {
        const client = new twilio_1.Twilio(accountSid, authToken);
        if (route.kind === 'messagingService') {
            await client.messages.create({
                messagingServiceSid: route.messagingServiceSid,
                to,
                body,
            });
        }
        else {
            await client.messages.create({
                from: route.from,
                to,
                body,
            });
        }
        return { ok: true };
    }
    catch (e) {
        const err = e;
        const msg = err?.message ?? String(e);
        const codeTwilio = err?.code;
        // eslint-disable-next-line no-console
        console.error('[MedMind OTP] Twilio SMS error:', codeTwilio, msg, err?.moreInfo ?? '');
        const trialUnverifiedRecipient = codeTwilio === 21608 ||
            codeTwilio === '21608' ||
            /unverified/i.test(msg) ||
            /Trial accounts cannot/i.test(msg);
        return {
            ok: false,
            twilioError: msg,
            twilioCode: codeTwilio,
            trialUnverifiedRecipient,
        };
    }
}
const TRIAL_UNVERIFIED_HINT = 'On a Twilio trial account you must verify each destination number: Twilio Console → Phone Numbers → Manage → Verified Caller IDs (https://console.twilio.com/us1/develop/phone-numbers/manage/verified). Or upgrade the account and add billing to send to any number.';
/** Extra guidance for API responses when Twilio rejects the send. */
function twilioSmsFailureHint(sms) {
    if (sms.ok || 'notConfigured' in sms)
        return '';
    if (sms.trialUnverifiedRecipient)
        return ` ${TRIAL_UNVERIFIED_HINT}`;
    return ' Check TWILIO_SMS_FROM / TWILIO_MESSAGING_SERVICE_SID and Twilio account logs.';
}
