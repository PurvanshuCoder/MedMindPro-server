import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

import { requireAuth } from '../middleware/auth'
import { UserModel } from '../models/User'
import {
  canResendOtp,
  generateOtpDigits,
  hashOtp,
  normalizeE164,
  otpExpiresAt,
  sendOtpSms,
  toWhatsAppAddress,
  twilioSmsFailureHint,
  verifyOtpHash,
} from '../services/auth/phoneOtp'

const router = express.Router()

const TOKEN_TTL = process.env.JWT_TTL ?? '7d'

function signToken(userId: string) {
  const jwtSecret = process.env.JWT_SECRET ?? 'change_me'
  return jwt.sign({ sub: userId }, jwtSecret as string, { expiresIn: TOKEN_TTL } as any)
}

function publicUser(u: {
  _id: unknown
  name: string
  email: string
  timezone?: string | null
  phone?: string | null
  phoneVerified?: boolean | null
}) {
  const phone = u.phone ?? ''
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    timezone: u.timezone ?? 'UTC',
    phoneVerified: Boolean(u.phoneVerified),
    phoneMasked: phone
      ? `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/./g, '•')}${phone.slice(-4)}`
      : '',
  }
}

async function issueLoginOtp(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const code = generateOtpDigits(6)
  const hash = await hashOtp(code)
  await UserModel.findByIdAndUpdate(userId, {
    authOtpHash: hash,
    authOtpExpires: otpExpiresAt(),
    authOtpPurpose: 'login',
    otpLastSentAt: new Date(),
  })
  const user = await UserModel.findById(userId)
  const phone = user?.phone
  if (!phone) return { ok: false, message: 'No phone on file' }

  const sms = await sendOtpSms(phone, code)
  if (sms.ok) return { ok: true }
  if ('notConfigured' in sms && sms.notConfigured) {
    return { ok: true }
  }
  await UserModel.findByIdAndUpdate(userId, {
    $unset: { authOtpHash: 1, authOtpPurpose: 1, authOtpExpires: 1 },
  })
  const base =
    'twilioError' in sms
      ? sms.twilioError
      : 'Could not send SMS. Check Twilio sender number and account.'
  return { ok: false, message: `${base}${twilioSmsFailureHint(sms)}` }
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone: phoneRaw } = req.body as {
      name?: string
      email?: string
      password?: string
      phone?: string
    }

    if (!name || !email || !password || !phoneRaw) {
      return res
        .status(400)
        .json({ message: 'name, email, password, and phone are required' })
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    }

    const phone = normalizeE164(phoneRaw)
    if (!phone) {
      return res.status(400).json({
        message: 'Invalid phone. Use international format with country code, e.g. +15551234567',
      })
    }

    const existing = await UserModel.findOne({ email: email.toLowerCase().trim() })
    if (existing) return res.status(409).json({ message: 'Email already in use' })

    const phoneTaken = await UserModel.findOne({ phone })
    if (phoneTaken) return res.status(409).json({ message: 'Phone number already registered' })

    const passwordHash = await bcrypt.hash(password, 10)
    const code = generateOtpDigits(6)
    const hash = await hashOtp(code)

    const created = await UserModel.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      phone,
      phoneVerified: false,
      whatsappNumber: '',
      authOtpHash: hash,
      authOtpExpires: otpExpiresAt(),
      authOtpPurpose: 'register',
      otpLastSentAt: new Date(),
    })

    const sms = await sendOtpSms(phone, code)
    if (!sms.ok && 'twilioError' in sms) {
      await UserModel.findByIdAndDelete(created._id)
      return res.status(502).json({
        code: sms.trialUnverifiedRecipient ? 'TWILIO_TRIAL_UNVERIFIED_RECIPIENT' : 'TWILIO_SMS_FAILED',
        message: `SMS could not be sent: ${sms.twilioError}.${twilioSmsFailureHint(sms)}`,
      })
    }

    return res.status(201).json({
      needsPhoneVerification: true,
      email: email.toLowerCase().trim(),
      smsDelivered: sms.ok,
      message: sms.ok
        ? 'Enter the verification code sent to your phone.'
        : 'Account created but SMS is not configured on the server. Check the API message or server console for the OTP, then configure TWILIO_SMS_FROM or TWILIO_MESSAGING_SERVICE_SID.',
    })
  } catch (e) {
    return res.status(500).json({ message: 'Failed to register user' })
  }
})

router.post('/verify-phone', async (req, res) => {
  try {
    const { email, code } = req.body as { email?: string; code?: string }
    if (!email || !code) {
      return res.status(400).json({ message: 'email and code are required' })
    }

    const user = await UserModel.findOne({ email: email.toLowerCase().trim() }).select(
      '+authOtpHash +authOtpExpires +authOtpPurpose',
    )
    if (!user) return res.status(404).json({ message: 'User not found' })

    if (user.authOtpPurpose !== 'register') {
      return res.status(400).json({ message: 'No registration verification pending' })
    }
    if (!user.authOtpExpires || user.authOtpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Code expired. Request a new one.' })
    }
    const ok = await verifyOtpHash(String(code).trim(), user.authOtpHash ?? '')
    if (!ok) return res.status(400).json({ message: 'Invalid code' })

    user.phoneVerified = true
    user.whatsappNumber = user.phone ? toWhatsAppAddress(user.phone) : ''
    user.authOtpHash = ''
    user.authOtpPurpose = ''
    user.authOtpExpires = undefined
    user.channels = user.channels ?? { emailEnabled: true, whatsappEnabled: false }
    await user.save()

    const token = signToken(user._id.toString())
    return res.json({
      token,
      user: publicUser(user),
    })
  } catch {
    return res.status(500).json({ message: 'Verification failed' })
  }
})

/** Helps debug 405: browsers may turn POST→GET on some redirects; static hosts return 405 on POST. */
router.get('/login', (_req, res) => {
  res.setHeader('Allow', 'POST')
  return res.status(405).json({
    message:
      'Login must use POST. If you opened this URL in a tab or see this from the app, set VITE_API_BASE_URL to your API base (e.g. https://your-api.railway.app) — not the Vercel frontend URL — and use https if your host redirects http (redirects can strip POST).',
  })
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' })
    }

    const user = await UserModel.findOne({ email: email.toLowerCase().trim() }).select(
      '+authOtpHash +authOtpExpires +authOtpPurpose',
    )
    if (!user) return res.status(401).json({ message: 'Invalid credentials' })

    const pwOk = await bcrypt.compare(password, user.passwordHash)
    if (!pwOk) return res.status(401).json({ message: 'Invalid credentials' })

    if (user.phone && !user.phoneVerified) {
      return res.status(403).json({
        message: 'Complete phone verification first.',
        needsPhoneVerification: true,
        email: user.email,
      })
    }

    if (user.phoneVerified && user.phone) {
      const hasValidPending =
        user.authOtpPurpose === 'login' &&
        user.authOtpExpires &&
        user.authOtpExpires.getTime() > Date.now()

      if (hasValidPending && !canResendOtp(user.otpLastSentAt)) {
        return res.json({
          needsOtp: true,
          email: user.email,
          message: 'Enter the code we sent to your phone.',
        })
      }

      const sent = await issueLoginOtp(user._id.toString())
      if (!sent.ok) {
        return res.status(502).json({
          message: `Could not send login code: ${sent.message}`,
        })
      }
      return res.json({
        needsOtp: true,
        email: user.email,
        message: 'Enter the verification code sent to your phone.',
      })
    }

    const token = signToken(user._id.toString())
    return res.json({
      token,
      user: publicUser(user),
    })
  } catch {
    return res.status(500).json({ message: 'Failed to login' })
  }
})

router.post('/login/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body as { email?: string; code?: string }
    if (!email || !code) {
      return res.status(400).json({ message: 'email and code are required' })
    }

    const user = await UserModel.findOne({ email: email.toLowerCase().trim() }).select(
      '+authOtpHash +authOtpExpires +authOtpPurpose',
    )
    if (!user) return res.status(401).json({ message: 'Invalid credentials' })

    if (user.authOtpPurpose !== 'login') {
      return res.status(400).json({ message: 'No login verification pending' })
    }
    if (!user.authOtpExpires || user.authOtpExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'Code expired. Sign in again.' })
    }
    const ok = await verifyOtpHash(String(code).trim(), user.authOtpHash ?? '')
    if (!ok) return res.status(400).json({ message: 'Invalid code' })

    user.authOtpHash = ''
    user.authOtpPurpose = ''
    user.authOtpExpires = undefined
    await user.save()

    const token = signToken(user._id.toString())
    return res.json({
      token,
      user: publicUser(user),
    })
  } catch {
    return res.status(500).json({ message: 'Verification failed' })
  }
})

router.post('/resend-otp', async (req, res) => {
  try {
    const { email, purpose } = req.body as { email?: string; purpose?: string }
    if (!email || !purpose) {
      return res.status(400).json({ message: 'email and purpose are required' })
    }
    if (purpose !== 'register' && purpose !== 'login') {
      return res.status(400).json({ message: 'purpose must be register or login' })
    }

    const user = await UserModel.findOne({ email: email.toLowerCase().trim() }).select(
      '+authOtpHash +authOtpExpires +authOtpPurpose',
    )
    if (!user) return res.status(404).json({ message: 'User not found' })

    if (purpose === 'register' && user.phoneVerified) {
      return res.status(400).json({ message: 'Phone already verified' })
    }
    if (purpose === 'login' && !user.phoneVerified) {
      return res.status(400).json({ message: 'Complete signup verification first' })
    }

    if (!canResendOtp(user.otpLastSentAt)) {
      return res.status(429).json({ message: 'Wait a minute before requesting another code.' })
    }

    const code = generateOtpDigits(6)
    const hash = await hashOtp(code)
    user.authOtpHash = hash
    user.authOtpExpires = otpExpiresAt()
    user.authOtpPurpose = purpose
    user.otpLastSentAt = new Date()
    await user.save()

    if (!user.phone) {
      return res.status(400).json({ message: 'No phone on file' })
    }
    const sms = await sendOtpSms(user.phone, code)
    if (!sms.ok && 'twilioError' in sms) {
      return res.status(502).json({
        code: sms.trialUnverifiedRecipient ? 'TWILIO_TRIAL_UNVERIFIED_RECIPIENT' : 'TWILIO_SMS_FAILED',
        message: `SMS failed: ${sms.twilioError}.${twilioSmsFailureHint(sms)}`,
      })
    }

    return res.json({
      ok: true,
      message: sms.ok ? 'New code sent.' : 'Code updated; SMS not sent (check server logs / Twilio config).',
      smsDelivered: sms.ok,
    })
  } catch {
    return res.status(500).json({ message: 'Failed to resend code' })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id
    if (!userId) return res.status(401).json({ message: 'Unauthorized' })

    const user = await UserModel.findById(userId).select(
      'name email channels timezone notificationEmail whatsappNumber phone phoneVerified',
    )
    if (!user) return res.status(404).json({ message: 'User not found' })

    return res.json({
      user: {
        ...publicUser(user),
        channels: user.channels,
        notificationEmail: user.notificationEmail,
        whatsappNumber: user.whatsappNumber,
      },
    })
  } catch {
    return res.status(500).json({ message: 'Failed to load profile' })
  }
})

export const authRouter = router
