import express from 'express'
import { requireAuth } from '../middleware/auth'
import {
  chatEnrichWithLLM,
  generateAdherenceInsights,
  getConfiguredAiProvider,
  type GeminiChatMessage,
} from '../services/ai/medicineEnrichment'
import { MedicineModel } from '../models/Medicine'

const router = express.Router()

router.get('/status', (_req, res) => {
  const provider = getConfiguredAiProvider()
  return res.json({
    configured: Boolean(provider),
    provider: provider ?? null,
  })
})

router.post('/insights', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const medicines = await MedicineModel.find({ owner: userId })
      .select('name dosage frequency instructions reminders')
      .lean()

    const payload = medicines.map((m) => ({
      name: m.name,
      dosage: m.dosage ?? '—',
      frequency: m.frequency ?? '',
      instructions: m.instructions ?? '',
      reminders: m.reminders ?? { enabled: false, times: [] },
    }))

    const { markdown, provider } = await generateAdherenceInsights(payload)
    return res.json({ markdown, provider })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI insights failed.'
    return res.status(500).json({ message })
  }
})

router.post('/chat', requireAuth, async (req, res) => {
  try {
    const body = req.body as {
      ocrText?: string
      currentDraft?: Partial<{
        name: string
        dosage: string
        frequency: string
        instructions: string
        description: string
        sideEffects: string
        precautions: string
      }>
      messages?: Array<GeminiChatMessage>
    }

    const ocrText = (body.ocrText ?? '').toString()
    if (!ocrText) {
      return res.status(400).json({ message: 'Missing ocrText' })
    }

    const currentDraft = body.currentDraft ?? {}
    const current = {
      name: (currentDraft.name ?? '').toString() || 'Medicine',
      dosage: (currentDraft.dosage ?? '').toString() || '—',
      frequency: (currentDraft.frequency ?? '').toString() || 'Once daily',
      instructions: (currentDraft.instructions ?? '').toString(),
      description: (currentDraft.description ?? '').toString(),
      sideEffects: (currentDraft.sideEffects ?? '').toString(),
      precautions: (currentDraft.precautions ?? '').toString(),
    }

    const messages = Array.isArray(body.messages) ? body.messages : []

    const { enriched, provider, profileMarkdown } = await chatEnrichWithLLM(
      ocrText,
      current,
      messages,
    )

    return res.json({
      updatedDraft: enriched,
      profileMarkdown,
      provider,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'AI chat failed.'
    return res.status(500).json({ message })
  }
})

export const aiRouter = router
