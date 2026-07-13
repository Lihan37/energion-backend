import jwt from 'jsonwebtoken'

import { env } from '../config/env.js'

export function signAuthToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn })
}

function getCookieOptions(req) {
  // A request is secure when it arrives over https (directly or via a trusted
  // proxy like Railway). Cross-site cookies — frontend and API on different
  // domains — require SameSite=None; Secure, so the browser will store and send
  // them. For local http dev we fall back to Lax + non-secure.
  const isSecure = Boolean(
    req?.secure || req?.headers?.['x-forwarded-proto'] === 'https',
  )

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }
}

export function setAuthCookie(req, res, token) {
  res.cookie('token', token, getCookieOptions(req))
}

export function clearAuthCookie(req, res) {
  const { maxAge: _maxAge, ...cookieOptions } = getCookieOptions(req)
  res.clearCookie('token', cookieOptions)
}
