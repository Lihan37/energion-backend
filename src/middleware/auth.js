import jwt from 'jsonwebtoken'
import { ObjectId } from 'mongodb'

import { getDb } from '../config/db.js'
import { env } from '../config/env.js'
import { sanitizeUser } from '../utils/users.js'

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization

  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  return req.cookies?.token ?? null
}

export async function requireAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req)

    if (!token) {
      return res.status(401).json({ message: 'Authentication required.' })
    }

    const decoded = jwt.verify(token, env.jwtSecret)
    const user = await getDb().collection('users').findOne({ _id: new ObjectId(decoded.sub) })

    if (!user) {
      return res.status(401).json({ message: 'User session is no longer valid.' })
    }

    req.auth = {
      token,
      user,
      safeUser: sanitizeUser(user),
    }

    next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired authentication token.' })
  }
}

export function requireAdmin(req, res, next) {
  if (req.auth?.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access is required.' })
  }

  next()
}
