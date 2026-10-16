import test from 'node:test'
import assert from 'node:assert/strict'
import { productSchema } from '../src/utils/productSchema.js'
import { serializeProduct } from '../src/utils/products.js'

const product = {
  name: 'Aura',
  category: 'Urban',
  price: 0,
  colors: ['Black'],
  shortDescription: 'A refined electric scooter silhouette.',
  description:
    'Explore the supplied Aura images and enquire for verified technical specifications.',
}

test('unverified numbers may be omitted without fabricating specifications', () => {
  const parsed = productSchema.parse(product)
  assert.equal(parsed.battery, '')
  assert.equal(parsed.range, '')
  assert.deepEqual(parsed.specs, [])
  assert.equal(parsed.price, 0)
})

test('gallery metadata and visibility survive serialization', () => {
  const images = [
    {
      url: 'https://res.cloudinary.com/example/image/upload/aura.webp',
      alt: 'Aura in black',
      caption: 'Aura side profile',
      colour: 'Black',
      publicId: 'energion/products/aura/black',
    },
  ]
  const parsed = productSchema.parse({ ...product, images, published: false })
  const serialized = serializeProduct({ ...parsed, image: images[0].url })
  assert.deepEqual(serialized.images, images)
  assert.equal(serialized.published, false)
})

test('existing products remain visible by default and retain their internal price', () => {
  const serialized = serializeProduct({ ...product, price: 123456 })
  assert.equal(serialized.published, true)
  assert.equal(serialized.price, 123456)
})

test('invalid or insecure gallery images and negative prices are rejected', () => {
  assert.equal(
    productSchema.safeParse({
      ...product,
      images: [{ url: 'http://insecure.test/a.webp', alt: 'Aura' }],
    }).success,
    false,
  )
  assert.equal(productSchema.safeParse({ ...product, price: -1 }).success, false)
})
