import mongoose from 'mongoose'

export type UserChannels = {
  emailEnabled: boolean
  whatsappEnabled: boolean
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    timezone: { type: String, default: 'UTC' },
    notificationEmail: { type: String, default: '' },
    /** E.164, e.g. +15551234567 (omit until set — avoids empty unique collisions) */
    phone: { type: String, trim: true },
    phoneVerified: { type: Boolean, default: false },

    whatsappNumber: { type: String, default: '' },

    authOtpHash: { type: String, default: '', select: false },
    authOtpExpires: { type: Date, select: false },
    /** register | login */
    authOtpPurpose: { type: String, default: '', select: false },
    otpLastSentAt: { type: Date },

    channels: {
      emailEnabled: { type: Boolean, default: true },
      whatsappEnabled: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
)

userSchema.index({ phone: 1 }, { unique: true, sparse: true })

export type User = mongoose.InferSchemaType<typeof userSchema>

export const UserModel = mongoose.model<User>('User', userSchema)

