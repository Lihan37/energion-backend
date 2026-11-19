import { Router } from 'express'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { ObjectId } from 'mongodb'
import { getDb } from '../config/db.js'
import { env } from '../config/env.js'
import { uploadImageBuffer } from '../config/cloudinary.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sanitizeUser, normalizePhone } from '../utils/users.js'
import { adminRoleSchema, blogSchema, dealerSchema, messageSchema, settingsSchema } from '../utils/contentSchemas.js'

const resources = { blogs: blogSchema, dealers: dealerSchema }
const serialize = ({ _id, ...record }) => ({ ...record, id: String(_id) })
function id(value) {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(value)) return null
  return /^[a-fA-F0-9]{24}$/.test(value) ? new ObjectId(value) : value
}
function parse(schema, body, res) {
  const parsed = schema.safeParse(body)
  if (!parsed.success) { res.status(400).json({ message: parsed.error.issues[0].message }); return null }
  return parsed.data
}

export function createPublicContentRouter(db = getDb) {
  const router = Router()
  router.get('/settings', asyncHandler(async (_req, res) => {
    const settings = await db().collection('settings').findOne({ _id: 'site' })
    if (!settings) return res.status(503).json({ message: 'Site settings are not initialized.' })
    return res.json({ settings: settingsSchema.parse(settings) })
  }))
  router.get('/blogs/:slug', asyncHandler(async (req, res) => {
    const blog = await db().collection('blogs').findOne({ slug: req.params.slug, published: true })
    if (!blog) return res.status(404).json({ message: 'Story not found.' })
    return res.json({ blog: serialize(blog) })
  }))
  for (const resource of Object.keys(resources)) router.get(`/${resource}`, asyncHandler(async (_req, res) => {
    const records = await db().collection(resource).find({ published: true }).sort({ order: 1, createdAt: 1 }).toArray()
    return res.json({ [resource]: records.map(serialize) })
  }))
  router.post('/messages', rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many enquiries. Please try again later or call our team.' } }), asyncHandler(async (req, res) => {
    const body = parse(messageSchema, req.body, res)
    if (!body) return
    await db().collection('messages').insertOne({ ...body, status: 'new', createdAt: new Date().toISOString() })
    return res.status(201).json({ message: 'Your enquiry has been saved for our team. Thank you for getting in touch.' })
  }))
  return router
}

export function createAdminContentRouter({ db = getDb, authorize = [requireAuth, requireAdmin], uploadImage = uploadImageBuffer } = {}) {
  const router = Router()
  router.use(...authorize)
  router.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin
      if ((origin && !env.frontendUrls.includes(origin)) || (!origin && req.cookies?.token && !req.headers.authorization)) {
        return res.status(403).json({ message: 'Untrusted request origin.' })
      }
    }
    next()
  })
  router.get('/settings', asyncHandler(async (_req, res) => {
    const settings = await db().collection('settings').findOne({ _id: 'site' })
    return res.json({ settings: settingsSchema.parse(settings) })
  }))
  router.put('/settings', asyncHandler(async (req, res) => {
    const settings = parse(settingsSchema, req.body, res)
    if (!settings) return
    await db().collection('settings').updateOne({ _id: 'site' }, { $set: { ...settings, updatedAt: new Date().toISOString() } }, { upsert: true })
    return res.json({ settings })
  }))
  router.get('/admins', asyncHandler(async (req, res) => {
    const canManage = env.adminPhones.includes(req.auth.user.phone)
    const users = await db().collection('users').find(canManage ? {} : { role: 'admin' }).sort({ name: 1 }).project({ password: 0 }).toArray()
    return res.json({ users: users.map(sanitizeUser), protectedPhones: env.adminPhones, canManage })
  }))
  router.put('/admins', asyncHandler(async (req, res) => {
    if (!env.adminPhones.includes(req.auth.user.phone)) return res.status(403).json({ message: 'Only a configured primary admin can change access.' })
    const body = parse(adminRoleSchema, req.body, res)
    if (!body) return
    const phone = normalizePhone(body.phone)
    if (body.role !== 'admin' && (env.adminPhones.includes(phone) || phone === req.auth.user.phone)) return res.status(400).json({ message: 'Primary admins and your own access cannot be revoked here.' })
    const result = await db().collection('users').updateOne({ phone }, { $set: { role: body.role, updatedAt: new Date().toISOString() } })
    if (!result.matchedCount) return res.status(404).json({ message: 'No registered account has this phone number. Ask the person to sign up first.' })
    return res.json({ message: 'Admin access updated.' })
  }))
  router.get('/messages', asyncHandler(async (_req, res) => {
    const messages = await db().collection('messages').find({}).sort({ createdAt: -1 }).limit(500).toArray()
    return res.json({ messages: messages.map(serialize) })
  }))
  router.patch('/messages/:id', asyncHandler(async (req, res) => {
    const messageId = id(req.params.id)
    if (!messageId || !['new', 'read', 'resolved'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid message status or id.' })
    const result = await db().collection('messages').updateOne({ _id: messageId }, { $set: { status: req.body.status, updatedAt: new Date().toISOString() } })
    if (!result.matchedCount) return res.status(404).json({ message: 'Message not found.' })
    return res.json({ message: 'Message updated.' })
  }))
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, done) => done(null, ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.mimetype)) })
  router.post('/uploads', (req, res, next) => upload.single('image')(req, res, error => {
    if (error) return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'Choose one JPG, PNG, WebP or AVIF image up to 5 MB.' })
    next()
  }), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Choose a JPG, PNG, WebP or AVIF image up to 5 MB.' })
    try {
      const result = await uploadImage(req.file.buffer, 'energion/editorial')
      return res.status(201).json({ url: result.secureUrl })
    } catch {
      return res.status(503).json({ message: 'Image upload unavailable. Check Cloudinary configuration and try again.' })
    }
  }))
  for (const [resource, schema] of Object.entries(resources)) {
    router.get(`/${resource}`, asyncHandler(async (_req, res) => {
      const records = await db().collection(resource).find({}).sort({ order: 1, createdAt: 1 }).toArray()
      return res.json({ [resource]: records.map(serialize) })
    }))
    router.post(`/${resource}`, asyncHandler(async (req, res) => {
      const body = parse(schema, req.body, res)
      if (!body) return
      const now = new Date().toISOString()
      try {
        const result = await db().collection(resource).insertOne({ ...body, createdAt: now, updatedAt: now })
        return res.status(201).json({ record: { ...body, id: String(result.insertedId) } })
      } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'A story with this slug already exists.' })
        throw error
      }
    }))
    router.put(`/${resource}/:id`, asyncHandler(async (req, res) => {
      const recordId = id(req.params.id)
      if (!recordId) return res.status(400).json({ message: 'Invalid record id.' })
      const body = parse(schema, req.body, res)
      if (!body) return
      try {
        const result = await db().collection(resource).updateOne({ _id: recordId }, { $set: { ...body, updatedAt: new Date().toISOString() } })
        if (!result.matchedCount) return res.status(404).json({ message: 'Record not found.' })
        return res.json({ record: { ...body, id: req.params.id } })
      } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: 'A story with this slug already exists.' })
        throw error
      }
    }))
    router.delete(`/${resource}/:id`, asyncHandler(async (req, res) => {
      const recordId = id(req.params.id)
      if (!recordId) return res.status(400).json({ message: 'Invalid record id.' })
      const result = await db().collection(resource).deleteOne({ _id: recordId })
      if (!result.deletedCount) return res.status(404).json({ message: 'Record not found.' })
      return res.json({ message: 'Record deleted.' })
    }))
  }
  return router
}
