import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'

import { deleteImage, uploadImageBuffer } from '../config/cloudinary.js'
import { getDb } from '../config/db.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { serializeProduct, slugifyProductName, toObjectId } from '../utils/products.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(new Error('Only image uploads are allowed.'))
      return
    }

    callback(null, true)
  },
})

const summaryRouteHandler = asyncHandler(async (_req, res) => {
  const db = getDb()
  const [products, blogs, dealers, messages, users, admins] = await Promise.all([
    db.collection('products').countDocuments(),
    db.collection('blogs').countDocuments(),
    db.collection('dealers').countDocuments(),
    db.collection('messages').countDocuments(),
    db.collection('users').countDocuments(),
    db.collection('users').countDocuments({ role: 'admin' }),
  ])

  return res.json({
    summary: {
      products,
      blogs,
      dealers,
      messages,
      users,
      admins,
    },
  })
})

const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required.'),
  slug: z.string().trim().optional().default(''),
  category: z.string().trim().min(2, 'Category is required.'),
  price: z.coerce.number().min(1, 'Price must be greater than 0.'),
  battery: z.string().trim().min(2, 'Battery is required.'),
  range: z.string().trim().min(2, 'Range is required.'),
  topSpeed: z.string().trim().min(2, 'Top speed is required.'),
  chargingTime: z.string().trim().min(2, 'Charging time is required.'),
  colors: z.array(z.string().trim().min(1)).min(1, 'Add at least one color.'),
  shortDescription: z.string().trim().min(10, 'Short description is too short.'),
  description: z.string().trim().min(20, 'Description is too short.'),
  featured: z.coerce.boolean().optional().default(false),
  tag: z.string().trim().optional().default(''),
  removeImage: z.coerce.boolean().optional().default(false),
  specs: z.array(z.object({
    label: z.string().trim().min(1, 'Spec label is required.'),
    value: z.string().trim().min(1, 'Spec value is required.'),
  })).min(1, 'Add at least one specification.'),
})

function parseProductPayload(req) {
  const rawPayload = req.body.payload

  if (!rawPayload) {
    throw new Error('Missing product payload.')
  }

  return JSON.parse(rawPayload)
}

async function ensureUniqueSlug(productsCollection, slug, currentId = null) {
  const existing = await productsCollection.findOne({ slug })

  if (!existing) {
    return
  }

  if (currentId && existing._id.toString() === currentId.toString()) {
    return
  }

  throw new Error('A product with this slug already exists.')
}

router.get('/summary', requireAuth, requireAdmin, summaryRouteHandler)

router.get('/products', requireAuth, requireAdmin, asyncHandler(async (_req, res) => {
  const products = await getDb()
    .collection('products')
    .find({})
    .sort({ createdAt: -1 })
    .toArray()

  return res.json({ products: products.map(serializeProduct) })
}))

router.post('/products', requireAuth, requireAdmin, upload.single('image'), asyncHandler(async (req, res) => {
  const parsed = productSchema.safeParse(parseProductPayload(req))

  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid product payload.' })
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Product image is required.' })
  }

  const productsCollection = getDb().collection('products')
  const slug = parsed.data.slug || slugifyProductName(parsed.data.name)
  await ensureUniqueSlug(productsCollection, slug)

  const uploadedImage = await uploadImageBuffer(req.file.buffer)
  const now = new Date().toISOString()

  const newProduct = {
    ...parsed.data,
    removeImage: false,
    slug,
    tag: parsed.data.tag || '',
    image: uploadedImage.secureUrl,
    imagePublicId: uploadedImage.publicId,
    createdAt: now,
    updatedAt: now,
  }

  const result = await productsCollection.insertOne(newProduct)
  const inserted = await productsCollection.findOne({ _id: result.insertedId })

  return res.status(201).json({
    message: 'Product created successfully.',
    product: serializeProduct(inserted),
  })
}))

router.put('/products/:id', requireAuth, requireAdmin, upload.single('image'), asyncHandler(async (req, res) => {
  const parsed = productSchema.safeParse(parseProductPayload(req))

  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues[0]?.message ?? 'Invalid product payload.' })
  }

  const productId = toObjectId(req.params.id)

  if (!productId) {
    return res.status(400).json({ message: 'Invalid product id.' })
  }

  const productsCollection = getDb().collection('products')
  const existingProduct = await productsCollection.findOne({ _id: productId })

  if (!existingProduct) {
    return res.status(404).json({ message: 'Product not found.' })
  }

  const slug = parsed.data.slug || slugifyProductName(parsed.data.name)
  await ensureUniqueSlug(productsCollection, slug, productId)

  const shouldRemoveImage = parsed.data.removeImage && !req.file
  let image = existingProduct.image
  let imagePublicId = existingProduct.imagePublicId ?? ''

  if (req.file) {
    const uploadedImage = await uploadImageBuffer(req.file.buffer)
    image = uploadedImage.secureUrl
    imagePublicId = uploadedImage.publicId
  } else if (shouldRemoveImage) {
    image = ''
    imagePublicId = ''
  }

  const updateDoc = {
    ...parsed.data,
    removeImage: false,
    slug,
    tag: parsed.data.tag || '',
    image,
    imagePublicId,
    updatedAt: new Date().toISOString(),
  }

  await productsCollection.updateOne({ _id: productId }, { $set: updateDoc })

  if ((req.file || shouldRemoveImage) && existingProduct.imagePublicId) {
    await deleteImage(existingProduct.imagePublicId)
  }

  const updated = await productsCollection.findOne({ _id: productId })

  return res.json({
    message: 'Product updated successfully.',
    product: serializeProduct(updated),
  })
}))

router.delete('/products/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const productId = toObjectId(req.params.id)

  if (!productId) {
    return res.status(400).json({ message: 'Invalid product id.' })
  }

  const productsCollection = getDb().collection('products')
  const existingProduct = await productsCollection.findOne({ _id: productId })

  if (!existingProduct) {
    return res.status(404).json({ message: 'Product not found.' })
  }

  await productsCollection.deleteOne({ _id: productId })

  if (existingProduct.imagePublicId) {
    await deleteImage(existingProduct.imagePublicId)
  }

  return res.json({ message: 'Product deleted successfully.' })
}))

export default router
