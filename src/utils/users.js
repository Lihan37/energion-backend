export function normalizePhone(phone) {
  return phone.replace(/\s+/g, '')
}

export function sanitizeUser(user) {
  return {
    id: user._id?.toString?.() ?? user.id,
    name: user.name,
    phone: user.phone,
    email: user.email ?? '',
    role: user.role,
    createdAt: user.createdAt,
  }
}
