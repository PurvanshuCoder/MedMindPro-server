import mongoose from 'mongoose'

const notificationLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medicine', required: true },

    time: { type: String, required: true }, // "HH:mm"
    dateKey: { type: String, required: true }, // "YYYY-MM-DD"
    channel: { type: String, default: 'email' },

    sentAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
)

notificationLogSchema.index({ userId: 1, medicineId: 1, time: 1, dateKey: 1, channel: 1 }, { unique: true })

export type NotificationLog = mongoose.InferSchemaType<typeof notificationLogSchema>
export const NotificationLogModel = mongoose.model('NotificationLog', notificationLogSchema)

