import cors from 'cors'
import cookieParser from 'cookie-parser'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import morgan from 'morgan'

import { connectToDatabase } from './config/db.js'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandlers.js'
import adminRoutes from './routes/admin.routes.js'
import authRoutes from './routes/auth.routes.js'
import productsRoutes from './routes/products.routes.js'

const app = express()

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication requests. Please try again later.' },
})

app.use(cors({ origin: env.frontendUrls, credentials: true }))
app.use(helmet())
app.use(morgan('dev'))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Energion backend is running.' })
})

app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/products', productsRoutes)
app.use('/api/admin', adminRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

const startServer = async () => {
  await connectToDatabase()
  app.listen(env.port, () => {
    console.log(`Energion backend listening on port ${env.port}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start backend server:', error)
  process.exit(1)
})
