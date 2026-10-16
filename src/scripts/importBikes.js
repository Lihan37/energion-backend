import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { MongoClient, BSON } from 'mongodb'
import { env } from '../config/env.js'
import { productSchema } from '../utils/productSchema.js'

import { importModels } from '../data/importModels.js'

const manifestPath = process.argv.find((arg) => arg.endsWith('.json'))
if (!manifestPath)
  throw new Error('Provide the uploaded-images.json manifest. Use --apply to write changes.')
const assets = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8'))
if (
  assets.length !== 20 ||
  importModels.some((model) => !assets.some((image) => image.model === model.name))
)
  throw new Error('Expected all 20 images for all nine supplied models before importing.')
if (
  assets.some(
    (image) => !image.url.startsWith(`https://res.cloudinary.com/${env.cloudinaryCloudName}/`),
  )
)
  throw new Error('The manifest must belong to the configured Cloudinary account.')

const uri = env.dbUriTemplate
  .replace('<db_username>', encodeURIComponent(env.dbUser))
  .replace('<db_password>', encodeURIComponent(env.dbPass))
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 })
try {
  await client.connect()
  const collection = client.db(env.dbName).collection('products')
  const before = await collection.find({}).toArray()
  const changes = importModels.map((definition) => {
    const existing = before.find((product) => product.slug === definition.slug)
    const images = assets
      .filter((image) => image.model === definition.name)
      .map(({ url, publicId, alt, caption, colour }) => ({ url, publicId, alt, caption, colour }))
    const primary =
      images.find((image) =>
        `${image.url} ${image.colour}`
          .toLowerCase()
          .includes(definition.cover.replaceAll(' ', '-')),
      ) ??
      images.find((image) => image.colour.includes(definition.cover)) ??
      images[0]
    const { cover, ...details } = definition
    void cover
    const product = productSchema.parse({
      ...details,
      images,
      image: primary.url,
      published: true,
      featured: ['evox', 'nexo', 'xplorer-pro'].includes(definition.slug),
      price: existing?.price ?? 0,
      battery: existing?.battery ?? '',
      range: existing?.range ?? '',
      topSpeed: existing?.topSpeed ?? '',
      chargingTime: existing?.chargingTime ?? '',
      specs: existing?.specs ?? [],
    })
    return {
      ...product,
      image: primary.url,
      imagePublicId: primary.publicId,
      updatedAt: new Date().toISOString(),
    }
  })
  console.log(
    JSON.stringify(
      {
        models: changes.map((product) => ({
          name: product.name,
          images: product.images.length,
          existing: before.some((item) => item.slug === product.slug),
        })),
        archive: before
          .filter((product) => ['jaguar', 'venturer', 'xplorer'].includes(product.slug))
          .map((product) => product.name),
      },
      null,
      2,
    ),
  )
  if (!process.argv.includes('--apply')) {
    console.log('Dry run complete. No database changes made.')
  } else {
    // Check asset delivery before changing the public catalog.
    for (const asset of assets) {
      const response = await fetch(asset.url, { method: 'HEAD' })
      if (!response.ok) throw new Error(`Asset is not publicly accessible: ${asset.source}`)
    }
    const backupFolder = path.resolve('backups')
    await mkdir(backupFolder, { recursive: true })
    const backup = path.join(backupFolder, `products-before-import-${Date.now()}.json`)
    await writeFile(backup, BSON.EJSON.stringify(before, null, 2))
    console.log(`Saved database backup: ${backup}`)
    for (const product of changes) {
      await collection.updateOne(
        { slug: product.slug },
        { $set: product, $setOnInsert: { createdAt: new Date().toISOString() } },
        { upsert: true },
      )
    }
    await collection.updateMany(
      { slug: { $in: ['jaguar', 'venturer', 'xplorer'] } },
      { $set: { published: false, featured: false, updatedAt: new Date().toISOString() } },
    )
    console.log(
      'Imported nine models with all 20 images; older unmatched models retained privately for admin editing.',
    )
  }
} finally {
  await client.close()
}
