import dotenv from 'dotenv'

dotenv.config()

const requiredKeys = ['DB_USER', 'DB_PASS', 'JWT_SECRET']

for (const key of requiredKeys) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

// Refuse to boot with a weak or placeholder JWT secret: a guessable secret lets
// anyone forge auth tokens, so require a real, sufficiently long random value.
const PLACEHOLDER_JWT_SECRETS = new Set([
  'change-this-to-a-long-random-secret',
  'your-secret',
  'secret',
  'changeme',
])

const jwtSecret = process.env.JWT_SECRET

if (PLACEHOLDER_JWT_SECRETS.has(jwtSecret)) {
  throw new Error(
    'JWT_SECRET is still set to a placeholder value. Set it to a long random string ' +
      '(e.g. `node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"`).',
  )
}

if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long.')
}

function normalizeOrigin(origin) {
  return origin.replace(/\/+$/, '')
}

function parseOrigins(value) {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeOrigin)
}

// Origins that must always be allowed, regardless of the deployment's env vars,
// so a stale FRONTEND_URL can never lock the live site out via CORS.
const BASE_ALLOWED_ORIGINS = [
  'https://energion-emobility.com',
  'https://www.energion-emobility.com',
  'https://energion-emobility.netlify.app',
  'http://localhost:5173',
  'http://localhost:4173',
]

const envOrigins = parseOrigins(
  process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? '',
)

const frontendUrls = Array.from(
  new Set([...BASE_ALLOWED_ORIGINS.map(normalizeOrigin), ...envOrigins]),
)

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 5000),
  frontendUrl: frontendUrls[0],
  frontendUrls,
  dbUser: process.env.DB_USER,
  dbPass: process.env.DB_PASS,
  dbName: process.env.DB_NAME ?? 'energion',
  dbUriTemplate:
    process.env.DB_URI ??
    'mongodb+srv://<db_username>:<db_password>@cluster0.g9xsrko.mongodb.net/?appName=Cluster0',
  jwtSecret,
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
