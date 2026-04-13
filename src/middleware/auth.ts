import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null

  if (!token) return res.status(401).json({ message: 'Missing token' })

  try {
    const JWT_SECRET = process.env.JWT_SECRET ?? ''
    if (!JWT_SECRET) return res.status(500).json({ message: 'Server auth not configured' })
    const decoded = jwt.verify(token, JWT_SECRET)
    if (typeof decoded !== 'object' || decoded === null) {
      return res.status(401).json({ message: 'Invalid token payload' })
    }

    const userId = (decoded as { sub?: string }).sub
    if (!userId) return res.status(401).json({ message: 'Invalid token subject' })

    req.user = { id: userId as any }
    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}

