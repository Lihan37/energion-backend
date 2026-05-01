import { MongoClient, ServerApiVersion } from 'mongodb'

import { defaultProducts } from '../data/defaultProducts.js'
import { env } from '../config/env.js'

function buildMongoUri() {
  return env.dbUriTemplate
    .replace('<db_username>', encodeURIComponent(env.dbUser))
    .replace('<db_password>', encodeURIComponent(env.dbPass))
}

const client = new MongoClient(buildMongoUri(), {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function replaceProducts() {
  await client.connect()

  const db = client.db(env.dbName)
  const productsCollection = db.collection('products')
  const now = new Date().toISOString()

  await productsCollection.createIndex({ slug: 1 }, { unique: true })
  await productsCollection.deleteMany({})
  await productsCollection.insertMany(
    defaultProducts.map((product) => ({
      ...product,
      imagePublicId: '',
      createdAt: now,
      updatedAt: now,
    })),
  )

  console.log(`Replaced products collection with ${defaultProducts.length} document-based products.`)
}

replaceProducts()
  .catch((error) => {
    console.error('Failed to replace products collection:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await client.close()
  })
