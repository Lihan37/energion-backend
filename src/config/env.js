import dotenv from 'dotenv'

dotenv.config()

const requiredKeys = ['DB_USER', 'DB_PASS', 'JWT_SECRET']

for (const key of requiredKeys) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

function normalizeOrigin(origin) {
  return origin.replace(/\/+$/, '')
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 5000),
  frontendUrl: normalizeOrigin(process.env.FRONTEND_URL ?? 'https://energion-emobility.netlify.app'),
  dbUser: process.env.DB_USER,
  dbPass: process.env.DB_PASS,
  dbName: process.env.DB_NAME ?? 'energion',
  dbUriTemplate:
    process.env.DB_URI ??
    'mongodb+srv://<db_username>:<db_password>@cluster0.g9xsrko.mongodb.net/?appName=Cluster0',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  adminPhones: (process.env.ADMIN_PHONES ?? '01716285196')
    .split(',')
    .map((phone) => phone.trim())
    .filter(Boolean),
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 10),
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
}
