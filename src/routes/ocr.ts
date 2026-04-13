import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

import { requireAuth } from '../middleware/auth'
import { extractMedicineFromImage } from '../services/ocr/extractMedicine'

const router = express.Router()

const uploadDir = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    const name = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`
    cb(null, name)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image uploads are allowed'))
    cb(null, true)
  },
})

function publicBaseUrl() {
  return process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000'
}

router.post(
  '/extract',
  requireAuth,
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'Missing image file.' })
      const filePath = req.file.path

      const { extracted, provider, profileMarkdown, ocrText } = await extractMedicineFromImage(filePath)

      const imageUrl = `${publicBaseUrl()}/uploads/${encodeURIComponent(req.file.filename)}`

      return res.json({ extracted, imageUrl, provider, profileMarkdown, ocrText })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'OCR extraction failed.'
      return res.status(500).json({ message })
    }
  },
)

export const ocrRouter = router

