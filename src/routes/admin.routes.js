import { Router } from 'express'
import multer from 'multer'

import { deleteImage, uploadImageBuffer } from '../config/cloudinary.js'
import { getDb } from '../config/db.js'
import { requireAdmin, requireAuth } from '../middleware/auth.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { serializeProduct, slugifyProductName, toObjectId } from '../utils/products.js'
import { productSchema } from '../utils/productSchema.js'

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

router.get(
  '/products',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const products = await getDb().collection('products').find({}).sort({ createdAt: -1 }).toArray()

    return res.json({ products: products.map(serializeProduct) })
  }),
)

router.post(
  '/products',
  requireAuth,
  requireAdmin,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const parsed = productSchema.safeParse(parseProductPayload(req))

    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: parsed.error.issues[0]?.message ?? 'Invalid product payload.' })
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
      published: parsed.data.published ?? true,
      images: [
        ...(parsed.data.images ?? []),
        {
          url: uploadedImage.secureUrl,
          publicId: uploadedImage.publicId,
          alt: `${parsed.data.name} electric vehicle`,
          caption: '',
          colour: '',
        },
      ],
      createdAt: now,
      updatedAt: now,
    }

    const result = await productsCollection.insertOne(newProduct)
    const inserted = await productsCollection.findOne({ _id: result.insertedId })

    return res.status(201).json({
      message: 'Product created successfully.',
      product: serializeProduct(inserted),
    })
  }),
)

router.put(
  '/products/:id',
  requireAuth,
  requireAdmin,
  upload.single('image'),
  asyncHandler(async (req, res) => {
    const parsed = productSchema.safeParse(parseProductPayload(req))

    if (!parsed.success) {
      return res
        .status(400)
        .json({ message: parsed.error.issues[0]?.message ?? 'Invalid product payload.' })
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
    let images =
      parsed.data.images ??
      existingProduct.images ??
      (existingProduct.image
        ? [
            {
              url: existingProduct.image,
              publicId: imagePublicId,
              alt: `${existingProduct.name} electric vehicle`,
              caption: '',
              colour: '',
            },
          ]
        : [])

    if (req.file) {
      const uploadedImage = await uploadImageBuffer(req.file.buffer)
      image = uploadedImage.secureUrl
      imagePublicId = uploadedImage.publicId
      images = [
        ...images,
        {
          url: image,
          publicId: imagePublicId,
          alt: `${parsed.data.name} electric vehicle`,
          caption: '',
          colour: '',
        },
      ]
    } else if (shouldRemoveImage) {
      image = ''
      imagePublicId = ''
      images = images.filter((item) => item.url !== existingProduct.image)
    } else if (parsed.data.primaryImageUrl) {
      const primary = images.find((item) => item.url === parsed.data.primaryImageUrl)
      if (!primary)
        return res
          .status(400)
          .json({ message: 'Primary image must be included in the product gallery.' })
      image = primary.url
      imagePublicId = primary.publicId ?? existingProduct.imagePublicId ?? ''
    } else if (image && !images.some((item) => item.url === image)) {
      image = images[0]?.url ?? ''
      imagePublicId = images[0]?.publicId ?? ''
    }

    const updateDoc = {
      ...parsed.data,
      removeImage: false,
      slug,
      tag: parsed.data.tag || '',
      image,
      imagePublicId,
      images,
      published: parsed.data.published ?? existingProduct.published ?? true,
      updatedAt: new Date().toISOString(),
    }

    await productsCollection.updateOne({ _id: productId }, { $set: updateDoc })

    if (shouldRemoveImage && existingProduct.imagePublicId) {
      await deleteImage(existingProduct.imagePublicId, existingProduct.image)
    }

    const updated = await productsCollection.findOne({ _id: productId })

    return res.json({
      message: 'Product updated successfully.',
      product: serializeProduct(updated),
    })
  }),
)

router.delete(
  '/products/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
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
      await deleteImage(existingProduct.imagePublicId, existingProduct.image)
    }

    return res.json({ message: 'Product deleted successfully.' })
  }),
)

export default router
