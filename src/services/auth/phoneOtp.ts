import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { Twilio } from 'twilio'

const OTP_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000

/** Strip spaces/dashes; keep leading + and digits. */
export function normalizeE164(phone: string): string | null {
  const raw = phone.replace(/[\s()-]/g, '')
  if (!raw) return null
  const withPlus = raw.startsWith('+') ? raw : `+${raw}`
  if (!/^\+[1-9]\d{6,14}$/.test(withPlus)) return null
  return withPlus
}

export function toWhatsAppAddress(e164: string) {
  return `whatsapp:${e164}`
}

export function generateOtpDigits(length = 6) {
  let out = ''
  for (let i = 0; i < length; i++) out += String(crypto.randomInt(0, 10))
  return out
}

export async function hashOtp(code: string) {
  return bcrypt.hash(code, 9)
}

export async function verifyOtpHash(code: string, hash: string) {
  return bcrypt.compare(code, hash)
}

export function otpExpiresAt() {
  return new Date(Date.now() + OTP_TTL_MS)
}

export function canResendOtp(lastSentAt?: Date | null) {
  if (!lastSentAt) return true
  return Date.now() - lastSentAt.getTime() >= RESEND_COOLDOWN_MS
}

/**
 * Twilio "from" for SMS can be:
 * - TWILIO_MESSAGING_SERVICE_SID (MG…) — preferred for many accounts
 * - TWILIO_SMS_FROM — E.164 of your Twilio SMS-capable number
 * - TWILIO_PHONE_NUMBER — alias
 * - TWILIO_FROM_WHATSAPP — if set as E.164 (with or without whatsapp: prefix); same number if it supports SMS
 */
type SmsRoute =
  | { kind: 'messagingService'; messagingServiceSid: string }
  | { kind: 'fromNumber'; from: string }

function resolveTwilioSmsRoute(): SmsRoute | null {
  const ms = process.env.TWILIO_MESSAGING_SERVICE_SID?.replace(/\s/g, '').trim()
  if (ms && /^MG[a-f0-9]{32}$/i.test(ms)) {
    return { kind: 'messagingService', messagingServiceSid: ms }
  }

  const candidates = [
    process.env.TWILIO_SMS_FROM,
    process.env.TWILIO_PHONE_NUMBER,
    process.env.TWILIO_FROM_NUMBER,
  ]

  const waRaw = process.env.TWILIO_FROM_WHATSAPP?.trim()
  if (waRaw) {
    const stripped = waRaw
      .replace(/^whatsapp:/i, '')
      .replace(/^sms:/i, '')
      .replace(/\s/g, '')
    if (stripped.startsWith('+')) candidates.push(stripped)
  }

  for (const c of candidates) {
    if (!c) continue
    let n = c.replace(/\s/g, '').trim()
    n = n.replace(/^(whatsapp|sms):/i, '')
    if (n && /^\+[1-9]\d{6,14}$/.test(n)) {
      return { kind: 'fromNumber', from: n }
    }
  }

  return null
}

export type SendOtpSmsResult =
  | { ok: true }
  | { ok: false; notConfigured: true }
  | {
      ok: false
      twilioError: string
      /** Twilio REST error code when present (e.g. 21608 = trial → unverified recipient). */
      twilioCode?: number | string
      /** Trial account texting a number not in Verified Caller IDs. */
      trialUnverifiedRecipient?: boolean
    }

export async function sendOtpSms(toE164: string, code: string): Promise<SendOtpSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? ''
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? ''
  const to = toE164.replace(/\s/g, '')

  const body = `Your MedMind verification code is: ${code}. It expires in 10 minutes. Do not share this code.`

  if (!accountSid || !authToken) {
    // eslint-disable-next-line no-console
    console.warn(
      '[MedMind OTP] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing — SMS not sent. OTP:',
      code,
    )
    return { ok: false, notConfigured: true }
  }

  const route = resolveTwilioSmsRoute()
  if (!route) {
    // eslint-disable-next-line no-console
    console.warn(
      '[MedMind OTP] No SMS sender configured. Set one of:\n' +
        '  TWILIO_MESSAGING_SERVICE_SID=MG…\n' +
        '  TWILIO_SMS_FROM=+1… (your Twilio SMS number in E.164)\n' +
        '  or put the same E.164 in TWILIO_FROM_WHATSAPP (no spaces).\n' +
        'OTP for manual testing:',
      code,
    )
    return { ok: false, notConfigured: true }
  }

  try {
    const client = new Twilio(accountSid, authToken)
    if (route.kind === 'messagingService') {
      await client.messages.create({
        messagingServiceSid: route.messagingServiceSid,
        to,
        body,
      })
    } else {
      await client.messages.create({
        from: route.from,
        to,
        body,
      })
    }
    return { ok: true }
  } catch (e: unknown) {
    const err = e as { message?: string; code?: number | string; moreInfo?: string }
    const msg = err?.message ?? String(e)
    const codeTwilio = err?.code
    // eslint-disable-next-line no-console
    console.error('[MedMind OTP] Twilio SMS error:', codeTwilio, msg, err?.moreInfo ?? '')
    const trialUnverifiedRecipient =
      codeTwilio === 21608 ||
      codeTwilio === '21608' ||
      /unverified/i.test(msg) ||
      /Trial accounts cannot/i.test(msg)
    return {
      ok: false,
      twilioError: msg,
      twilioCode: codeTwilio,
      trialUnverifiedRecipient,
    }
  }
}

const TRIAL_UNVERIFIED_HINT =
  'On a Twilio trial account you must verify each destination number: Twilio Console → Phone Numbers → Manage → Verified Caller IDs (https://console.twilio.com/us1/develop/phone-numbers/manage/verified). Or upgrade the account and add billing to send to any number.'

/** Extra guidance for API responses when Twilio rejects the send. */
export function twilioSmsFailureHint(sms: SendOtpSmsResult): string {
  if (sms.ok || 'notConfigured' in sms) return ''
  if (sms.trialUnverifiedRecipient) return ` ${TRIAL_UNVERIFIED_HINT}`
  return ' Check TWILIO_SMS_FROM / TWILIO_MESSAGING_SERVICE_SID and Twilio account logs.'
}

export { OTP_TTL_MS, RESEND_COOLDOWN_MS }
