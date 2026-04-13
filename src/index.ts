import path from 'path'
import fs from 'fs'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import express from 'express'

import { createApp } from './app'
import { startNotificationScheduler } from './services/notifications/scheduler'
import { initWhatsAppWeb } from './services/whatsapp/whatsappWebClient'

dotenv.config()

const PORT = Number(process.env.PORT ?? 4000)
const MONGO_URI = process.env.MONGO_URI!
const JWT_SECRET = process.env.JWT_SECRET!

if (!MONGO_URI) throw new Error('Missing MONGO_URI in environment.')
if (!JWT_SECRET) throw new Error('Missing JWT_SECRET in environment.')

async function main() {
  const uploadDir = path.join(process.cwd(), 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })

  const app = createApp()
  app.use('/uploads', express.static(uploadDir))

  await mongoose.connect(MONGO_URI)
  // eslint-disable-next-line no-console
  console.log('MongoDB connected.')

  startNotificationScheduler()
  initWhatsAppWeb()

  app.listen(PORT,'0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${PORT}`)
  })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err)
  process.exit(1)
})

