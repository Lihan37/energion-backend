import { ObjectId } from 'mongodb'

export function slugifyProductName(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function serializeProduct(product) {
  return {
    id: product._id?.toString?.() ?? product.id,
    name: product.name,
    slug: product.slug,
    category: product.category,
    price: product.price,
    battery: product.battery,
    range: product.range,
    topSpeed: product.topSpeed,
    chargingTime: product.chargingTime,
    colors: product.colors ?? [],
    shortDescription: product.shortDescription,
    description: product.description,
    image: product.image,
    featured: Boolean(product.featured),
    tag: product.tag ?? '',
    specs: product.specs ?? [],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }
}

export function toObjectId(id) {
  if (!ObjectId.isValid(id)) {
    return null
  }

  return new ObjectId(id)
}
