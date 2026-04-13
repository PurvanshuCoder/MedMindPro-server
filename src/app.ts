import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { authRouter } from './routes/auth'
import { medicinesRouter } from './routes/medicines'
import { ocrRouter } from './routes/ocr'
import { aiRouter } from './routes/ai'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '2mb' }))
  app.use(morgan('dev'))

  app.get('/health', (_req, res) => res.json({ ok: true  }))

  app.use('/api/auth', authRouter)
  app.use('/api/medicines', medicinesRouter)
  app.use('/api/ocr', ocrRouter)
  app.use('/api/ai', aiRouter)

  return app
}

