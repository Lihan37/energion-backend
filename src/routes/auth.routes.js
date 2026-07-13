import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'

import { getDb } from '../config/db.js'
import { env } from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'
import { clearAuthCookie, setAuthCookie, signAuthToken } from '../utils/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { normalizePhone, sanitizeUser } from '../utils/users.js'

const router = Router()

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
  phone: z.string().trim().min(8, 'Phone number is required.'),
  email: z.string().trim().email('Invalid email address.').optional().or(z.literal('')),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
})

const loginSchema = z.object({
  phone: z.string().trim().min(8, 'Phone number is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
})

router.post('/signup', asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid request body.' })
  }

  const db = getDb()
  const usersCollection = db.collection('users')
  const phone = normalizePhone(parsed.data.phone)
  const email = parsed.data.email?.trim() || ''
  const existingUser = await usersCollection.findOne({ phone })

  if (existingUser) {
    return res.status(409).json({ message: 'An account with this phone number already exists.' })
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, env.bcryptSaltRounds)
  const role = env.adminPhones.includes(phone) ? 'admin' : 'user'
  const newUser = {
    name: parsed.data.name.trim(),
    phone,
    email,
    password: hashedPassword,
    role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const result = await usersCollection.insertOne(newUser)
  const insertedUser = { ...newUser, _id: result.insertedId }
  const token = signAuthToken({ sub: result.insertedId.toString(), role })

  setAuthCookie(req, res, token)

  return res.status(201).json({
    message: 'Account created successfully.',
    user: sanitizeUser(insertedUser),
  })
}))

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)

  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid request body.' })
  }

  const usersCollection = getDb().collection('users')
  const phone = normalizePhone(parsed.data.phone)
  const user = await usersCollection.findOne({ phone })

  if (!user) {
    return res.status(401).json({ message: 'Invalid phone or password.' })
  }

  const passwordMatches = await bcrypt.compare(parsed.data.password, user.password)

  if (!passwordMatches) {
    return res.status(401).json({ message: 'Invalid phone or password.' })
  }

  const token = signAuthToken({ sub: user._id.toString(), role: user.role })
  setAuthCookie(req, res, token)

  return res.json({
    message: 'Logged in successfully.',
    user: sanitizeUser(user),
  })
}))

router.post('/logout', (req, res) => {
  clearAuthCookie(req, res)
  return res.json({ message: 'Logged out successfully.' })
})

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  return res.json({ user: req.auth.safeUser })
}))

export default router
