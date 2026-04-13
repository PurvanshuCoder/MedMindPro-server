import nodemailer from 'nodemailer'
import type { User } from '../../models/User'
import type { Medicine } from '../../models/Medicine'
import {
  sendViaWhatsAppWeb,
  toWhatsAppWebChatId,
} from '../whatsapp/whatsappWebClient'

function normalizeTimeMessage(medicine: Medicine) {
  return `Time to take your medicine: ${medicine.name}\nDosage: ${medicine.dosage}`
}

export function buildImmediateReminderSavedMessage(
  medicineName: string,
  dosage: string,
  timesCsv: string,
) {
  return (
    `MedMind · Reminders saved (instant confirmation)\n` +
    `Medicine: ${medicineName}\n` +
    `Dosage: ${dosage}\n` +
    `Scheduled times: ${timesCsv}\n` +
    `You will get another WhatsApp at each scheduled time when it is due.`
  )
}

export async function sendReminderEmail(user: User, medicine: Medicine) {
  const from = process.env.EMAIL_FROM ?? ''
  const host = process.env.SMTP_HOST ?? ''
  const port = Number(process.env.SMTP_PORT ?? 587)
  const smtpUser = process.env.SMTP_USER ?? ''
  const smtpPass = process.env.SMTP_PASS ?? ''

  if (!from || !host || !smtpUser || !smtpPass) {
    // eslint-disable-next-line no-console
    console.warn('Email env is not configured; skipping email notification.')
    return { skipped: true as const }
  }

  const to = user.notificationEmail || user.email

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  await transporter.sendMail({
    from,
    to,
    subject: `Medicine reminder: ${medicine.name}`,
    text: normalizeTimeMessage(medicine),
  })

  return { sent: true as const }
}

export async function sendReminderWhatsApp(user: User, medicine: Medicine) {
  if (process.env.WHATSAPP_WEB_ENABLED !== 'true') {
    // eslint-disable-next-line no-console
    console.warn(
      'WHATSAPP_WEB_ENABLED is not true; skipping WhatsApp reminder.',
    )
    return { skipped: true as const }
  }

  const chatId = toWhatsAppWebChatId(user.whatsappNumber ?? '')
  if (!chatId) {
    // eslint-disable-next-line no-console
    console.warn('User whatsappNumber missing or invalid; skipping WhatsApp.')
    return { skipped: true as const }
  }

  return sendViaWhatsAppWeb(chatId, normalizeTimeMessage(medicine))
}

/** Transactional WhatsApp (immediate confirmation when user saves reminders, etc.). */
export async function sendWhatsAppText(user: User, text: string) {
  if (process.env.WHATSAPP_WEB_ENABLED !== 'true') {
    // eslint-disable-next-line no-console
    console.warn(
      'WHATSAPP_WEB_ENABLED is not true; skipping WhatsApp message.',
    )
    return { skipped: true as const }
  }

  const chatId = toWhatsAppWebChatId(user.whatsappNumber ?? '')
  if (!chatId) {
    // eslint-disable-next-line no-console
    console.warn(
      'User whatsappNumber missing or invalid; skipping WhatsApp message.',
    )
    return { skipped: true as const }
  }

  return sendViaWhatsAppWeb(chatId, text)
}
