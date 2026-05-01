import { Router } from 'express'

import { getDb } from '../config/db.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { serializeProduct } from '../utils/products.js'

const router = Router()

router.get('/', asyncHandler(async (_req, res) => {
  const products = await getDb()
    .collection('products')
    .find({})
    .sort({ featured: -1, createdAt: -1 })
    .toArray()

  return res.json({ products: products.map(serializeProduct) })
}))

export default router
