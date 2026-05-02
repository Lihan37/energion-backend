import jwt from 'jsonwebtoken'

import { env } from '../config/env.js'

export function signAuthToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn })
}

function getCookieOptions() {
  const isProduction = env.nodeEnv === 'production'

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }
}

export function setAuthCookie(res, token) {
  res.cookie('token', token, getCookieOptions())
}

export function clearAuthCookie(res) {
  const { maxAge: _maxAge, ...cookieOptions } = getCookieOptions()
  res.clearCookie('token', cookieOptions)
}
