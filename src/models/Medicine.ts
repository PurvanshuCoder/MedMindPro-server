import mongoose from 'mongoose'

export type ReminderSettings = {
  enabled: boolean
  times: string[] // "HH:mm"
}

const reminderSchema = new mongoose.Schema<ReminderSettings>(
  {
    enabled: { type: Boolean, default: true },
    times: { type: [String], default: ['08:00'] },
  },
  { _id: false },
)

const medicineSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    dosage: { type: String, default: '—' },
    frequency: { type: String, default: '' },
    instructions: { type: String, default: '' },
    description: { type: String, default: '' },
    sideEffects: { type: String, default: '' },
    precautions: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    reminders: { type: reminderSchema, default: () => ({ enabled: true, times: ['08:00'] }) },
  },
  { timestamps: true },
)

export type Medicine = mongoose.InferSchemaType<typeof medicineSchema>

export const MedicineModel = mongoose.model('Medicine', medicineSchema)

