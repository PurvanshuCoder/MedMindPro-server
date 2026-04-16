import path from 'path'
import mongoose from 'mongoose'
import qrcode from 'qrcode-terminal'
import { Client, LocalAuth, RemoteAuth } from 'whatsapp-web.js'

const { MongoStore } = require('wwebjs-mongo') as {
  MongoStore: new (args: { mongoose: typeof mongoose }) => any
}

let client: Client | null = null
let ready = false
let started = false

function buildAuthStrategy() {
  const remoteEnabled = process.env.WWEBJS_REMOTE_AUTH_ENABLED !== 'false'

  if (remoteEnabled) {
    const sessionName = process.env.WWEBJS_SESSION_NAME?.trim() || 'medmind-main'
    const backupSyncIntervalMs = Number(
      process.env.WWEBJS_REMOTE_BACKUP_MS ?? 300000,
    )

    // Requires Mongo to already be connected; index.ts does this before initWhatsAppWeb().
    const store = new MongoStore({ mongoose })
    // eslint-disable-next-line no-console
    console.log(`[WhatsApp Web] Using RemoteAuth session "${sessionName}".`)

    return new RemoteAuth({
      store,
      clientId: sessionName,
      backupSyncIntervalMs,
    })
  }

  const dataPath =
    process.env.WWEBJS_AUTH_PATH?.trim() ||
    path.join(process.cwd(), '.wwebjs_auth')
  // eslint-disable-next-line no-console
  console.log(`[WhatsApp Web] Using LocalAuth at ${dataPath}.`)
  return new LocalAuth({ dataPath })
}

/** E.164 or whatsapp:+… or digits → WhatsApp Web chat id (e.g. 12025551234@c.us). */
export function toWhatsAppWebChatId(raw: string): string | null {
  const t = raw.replace(/\s/g, '').trim()
  if (!t) return null
  const withoutPrefix = t.replace(/^whatsapp:/i, '')
  const digits = withoutPrefix.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return `${digits}@c.us`
}

export function initWhatsAppWeb(): void {
  if (process.env.WHATSAPP_WEB_ENABLED !== 'true') return
  if (started) return
  started = true

  client = new Client({
    authStrategy: buildAuthStrategy(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  })

  client.on('qr', (qr) => {
    // eslint-disable-next-line no-console
    console.log('\n[WhatsApp Web] Scan this QR with WhatsApp → Linked devices:\n')
    qrcode.generate(qr, { small: true })
    // eslint-disable-next-line no-console
    console.log('')
  })

  client.on('ready', () => {
    ready = true
    // eslint-disable-next-line no-console
    console.log('[WhatsApp Web] Client ready — reminder messages can be sent.')
  })

  client.on('authenticated', () => {
    // eslint-disable-next-line no-console
    console.log('[WhatsApp Web] Authenticated.')
  })

  client.on('auth_failure', (msg) => {
    ready = false
    // eslint-disable-next-line no-console
    console.error('[WhatsApp Web] Auth failure:', msg)
  })

  client.on('disconnected', (reason) => {
    ready = false
    // eslint-disable-next-line no-console
    console.warn('[WhatsApp Web] Disconnected:', reason)
  })

  client.initialize().catch((err) => {
    ready = false
    // eslint-disable-next-line no-console
    console.error('[WhatsApp Web] Failed to initialize:', err)
  })
}

export async function sendViaWhatsAppWeb(
  chatId: string,
  text: string,
): Promise<{ sent: true } | { skipped: true }> {
  if (!client || !ready) {
    // eslint-disable-next-line no-console
    console.warn(
      '[WhatsApp Web] Not ready (scan QR if needed); skipping WhatsApp send.',
    )
    return { skipped: true as const }
  }
  try {
    await client.sendMessage(chatId, text)
    return { sent: true as const }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[WhatsApp Web] sendMessage failed:', err)
    return { skipped: true as const }
  }
}
