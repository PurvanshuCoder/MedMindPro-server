import fs from 'fs'
import path from 'path'
import { createWorker } from 'tesseract.js'

let workerPromise: Promise<any> | null = null
let ocrInitPromise: Promise<void> | null = null

async function getWorker() {
  if (!workerPromise) workerPromise = Promise.resolve(createWorker('eng'))
  return workerPromise
}

async function initTesseract() {
  if (!ocrInitPromise) {
    ocrInitPromise = (async () => {
      const worker = await getWorker()
      // The API surface differs slightly across tesseract versions; keep it permissive.
      await worker.load?.()
      await worker.loadLanguage?.('eng')
      await worker.initialize?.('eng')
    })()
  }
  return ocrInitPromise
}

async function ocrWithTesseract(filePath: string) {
  await initTesseract()
  const worker = await getWorker()
  const { data } = await worker.recognize(filePath)
  return data.text ?? ''
}

async function ocrWithGoogleVision(filePath: string) {
  const apiKey = process.env.GOOGLE_VISION_API_KEY ?? ''
  if (!apiKey) throw new Error('GOOGLE_VISION_API_KEY is not set.')

  const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
  const base64 = fs.readFileSync(abs, { encoding: 'base64' })

  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: 'TEXT_DETECTION' }],
          },
        ],
      }),
    },
  )

  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Google Vision failed: ${resp.status} ${txt}`)
  }

  const data = (await resp.json()) as any
  const annotation = data?.responses?.[0]?.fullTextAnnotation?.text
  return typeof annotation === 'string' ? annotation : ''
}

export async function runOCR(filePath: string) {
  const provider = (process.env.OCR_PROVIDER ?? 'google').toLowerCase()

  // Default to Google Vision to match project configuration.
  // If you explicitly set OCR_PROVIDER=tesseract, we'll use local Tesseract instead.
  if (provider === 'tesseract') return ocrWithTesseract(filePath)

  // Otherwise, use Google Vision (requires GOOGLE_VISION_API_KEY).
  return ocrWithGoogleVision(filePath)
}

