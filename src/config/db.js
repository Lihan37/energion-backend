import { MongoClient, ServerApiVersion } from 'mongodb'

import { defaultProducts } from '../data/defaultProducts.js'
import { env } from './env.js'

let client
let database

function buildMongoUri() {
  return env.dbUriTemplate
    .replace('<db_username>', encodeURIComponent(env.dbUser))
    .replace('<db_password>', encodeURIComponent(env.dbPass))
}

async function seedProductsIfNeeded(db) {
  const productsCollection = db.collection('products')
  const count = await productsCollection.countDocuments()

  if (count > 0) {
    return
  }

  const now = new Date().toISOString()
  await productsCollection.insertMany(
    defaultProducts.map((product) => ({
      ...product,
      imagePublicId: '',
      createdAt: now,
      updatedAt: now,
    })),
  )

  console.log(`Seeded ${defaultProducts.length} default products from the company document.`)
}

export async function connectToDatabase() {
  if (database) return database

  client = new MongoClient(buildMongoUri(), {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  })

  try {
    await client.connect()
    await client.db('admin').command({ ping: 1 })

    database = client.db(env.dbName)

    await database.collection('users').createIndex({ phone: 1 }, { unique: true })
    await database.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true })
    await database.collection('products').createIndex({ slug: 1 }, { unique: true })

    await seedProductsIfNeeded(database)

    console.log(`MongoDB connected successfully to database "${env.dbName}"`)

    return database
  } catch (error) {
    console.error('MongoDB connection failed:', error)
    throw error
  }
}

export function getDb() {
  if (!database) {
    throw new Error('Database connection has not been initialized yet.')
  }

  return database
}
