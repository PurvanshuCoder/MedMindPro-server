import cron from 'node-cron'

import { MedicineModel } from '../../models/Medicine'
import { NotificationLogModel } from '../../models/NotificationLog'
import { sendReminderEmail, sendReminderWhatsApp } from './sender'

let started = false

/** Current wall-clock HH:mm and YYYY-MM-DD in the given IANA timezone (production-safe vs server-local only). */
export function wallClockInTimeZone(date: Date, timeZone: string): { time: string; dateKey: string } {
  const tz = timeZone?.trim() || 'UTC'
  try {
    const dtf = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const parts = dtf.formatToParts(date)
    const map: Record<string, string> = {}
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value
    }
    const hour = (map.hour ?? '00').padStart(2, '0')
    const minute = (map.minute ?? '00').padStart(2, '0')
    const year = map.year ?? '1970'
    const month = (map.month ?? '01').padStart(2, '0')
    const day = (map.day ?? '01').padStart(2, '0')
    return { time: `${hour}:${minute}`, dateKey: `${year}-${month}-${day}` }
  } catch {
    const d = date
    const hh = String(d.getUTCHours()).padStart(2, '0')
    const mm = String(d.getUTCMinutes()).padStart(2, '0')
    const yyyy = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return { time: `${hh}:${mm}`, dateKey: `${yyyy}-${month}-${day}` }
  }
}

export function startNotificationScheduler() {
  if (started) return
  started = true

  let inFlight = false

  cron.schedule('* * * * *', async () => {
    if (inFlight) return
    inFlight = true

    try {
      const now = new Date()

      const medicines = await MedicineModel.find({
        'reminders.enabled': true,
        'reminders.times.0': { $exists: true },
      }).populate('owner')

      for (const med of medicines) {
        const user = med.owner as any
        if (!user) continue

        const tz =
          typeof user.timezone === 'string' && user.timezone.trim()
            ? user.timezone.trim()
            : 'UTC'
        const { time: nowTime, dateKey: nowDateKey } = wallClockInTimeZone(now, tz)
        const times = med.reminders?.times ?? []

        if (!times.includes(nowTime)) continue

        if (user.channels?.emailEnabled) {
          const existing = await NotificationLogModel.findOne({
            userId: user._id,
            medicineId: med._id,
            time: nowTime,
            dateKey: nowDateKey,
            channel: 'email',
          })
          if (!existing) {
            await sendReminderEmail(user, med as any).catch(() => undefined)
            await NotificationLogModel.create({
              userId: user._id,
              medicineId: med._id,
              time: nowTime,
              dateKey: nowDateKey,
              channel: 'email',
            }).catch(() => undefined)
          }
        }

        if (user.channels?.whatsappEnabled) {
          const existingWa = await NotificationLogModel.findOne({
            userId: user._id,
            medicineId: med._id,
            time: nowTime,
            dateKey: nowDateKey,
            channel: 'whatsapp',
          })
          if (!existingWa) {
            try {
              const wa = await sendReminderWhatsApp(user, med as any)
              if (wa && 'sent' in wa && wa.sent) {
                await NotificationLogModel.create({
                  userId: user._id,
                  medicineId: med._id,
                  time: nowTime,
                  dateKey: nowDateKey,
                  channel: 'whatsapp',
                }).catch(() => undefined)
              }
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('[MedMind scheduler] WhatsApp reminder failed:', err)
            }
          }
        }
      }
    } finally {
      inFlight = false
    }
  })
}
