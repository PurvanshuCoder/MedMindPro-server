import express from 'express'
import mongoose from 'mongoose'

import { requireAuth } from '../middleware/auth'
import { MedicineModel } from '../models/Medicine'
import type { ReminderSettings } from '../models/Medicine'
import { UserModel } from '../models/User'
import {
  buildImmediateReminderSavedMessage,
  sendWhatsAppText,
} from '../services/notifications/sender'

const router = express.Router()

function parseTimes(times: unknown): string[] {
  if (!Array.isArray(times)) return []
  const out: string[] = []
  for (const t of times) {
    if (typeof t !== 'string') continue
    if (/^\d{2}:\d{2}$/.test(t)) out.push(t)
  }
  return out
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const medicines = await MedicineModel.find({ owner: userId }).sort({ createdAt: -1 })
    return res.json({ medicines })
  } catch {
    return res.status(500).json({ message: 'Failed to load medicines' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const body = req.body as {
      name?: string
      dosage?: string
      frequency?: string
      instructions?: string
      description?: string
      sideEffects?: string
      precautions?: string
      imageUrl?: string
      reminders?: ReminderSettings
    }

    const name = (body.name ?? '').toString().trim()
    if (!name) return res.status(400).json({ message: 'Medicine name is required' })

    const reminders = body.reminders ?? { enabled: true, times: ['08:00'] }
    const nextReminders: ReminderSettings = {
      enabled: Boolean(reminders.enabled),
      times: parseTimes(reminders.times),
    }
    if (nextReminders.times.length === 0) nextReminders.times = ['08:00']

    const created = await MedicineModel.create({
      owner: new mongoose.Types.ObjectId(userId),
      name,
      dosage: (body.dosage ?? '—').toString(),
      frequency: (body.frequency ?? '').toString(),
      instructions: (body.instructions ?? '').toString(),
      description: (body.description ?? '').toString(),
      sideEffects: (body.sideEffects ?? '').toString(),
      precautions: (body.precautions ?? '').toString(),
      imageUrl: (body.imageUrl ?? '').toString(),
      reminders: nextReminders,
    })

    const owner = await UserModel.findById(userId)
    if (owner?.whatsappNumber && nextReminders.enabled) {
      owner.channels = owner.channels ?? { emailEnabled: true, whatsappEnabled: false }
      owner.channels.whatsappEnabled = true
      await owner.save()
      const times = nextReminders.times.join(', ')
      try {
        const r = await sendWhatsAppText(
          owner,
          buildImmediateReminderSavedMessage(created.name, created.dosage, times),
        )
        if (r && 'skipped' in r && r.skipped) {
          // eslint-disable-next-line no-console
          console.warn('[MedMind] Immediate WhatsApp skipped after medicine create (env/number)')
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[MedMind] Immediate WhatsApp failed after medicine create:', e)
      }
    }

    return res.status(201).json({ medicine: created })
  } catch {
    return res.status(500).json({ message: 'Failed to create medicine' })
  }
})

router.patch('/:id/reminders', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const id = req.params.id
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' })

    const body = req.body as Partial<ReminderSettings>
    const nextReminders: ReminderSettings = {
      enabled: Boolean(body.enabled),
      times: parseTimes(body.times),
    }
    if (nextReminders.times.length === 0) nextReminders.times = ['08:00']

    const updated = await MedicineModel.findOneAndUpdate(
      { _id: id, owner: userId },
      { reminders: nextReminders },
      { new: true },
    )

    if (!updated) return res.status(404).json({ message: 'Medicine not found' })

    const owner = await UserModel.findById(userId)
    if (owner?.whatsappNumber && nextReminders.enabled) {
      owner.channels = owner.channels ?? { emailEnabled: true, whatsappEnabled: false }
      owner.channels.whatsappEnabled = true
      await owner.save()

      const times = nextReminders.times.join(', ')
      try {
        const r = await sendWhatsAppText(
          owner,
          buildImmediateReminderSavedMessage(updated.name, updated.dosage, times),
        )
        if (r && 'skipped' in r && r.skipped) {
          // eslint-disable-next-line no-console
          console.warn('[MedMind] Immediate WhatsApp skipped after reminder save (env/number)')
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[MedMind] Immediate WhatsApp failed after reminder save:', e)
      }
    }

    return res.json({ medicine: updated })
  } catch {
    return res.status(500).json({ message: 'Failed to update reminders' })
  }
})

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const id = req.params.id
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' })

    const deleted = await MedicineModel.findOneAndDelete({ _id: id, owner: userId })
    if (!deleted) return res.status(404).json({ message: 'Medicine not found' })

    return res.json({ ok: true })
  } catch {
    return res.status(500).json({ message: 'Failed to delete medicine' })
  }
})

export const medicinesRouter = router

