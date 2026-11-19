import { z } from 'zod'

const text = (max) => z.string().trim().min(1).max(max)
const image = z.string().trim().max(2000).refine((value) => {
  if (/^\/images\/[a-zA-Z0-9/_ .-]+$/.test(value)) return true
  try { return new URL(value).protocol === 'https:' } catch { return false }
}, 'Use an HTTPS image URL or a local /images/ path.')
export const blogSchema = z.object({
  title: text(180), slug: text(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  excerpt: text(1000), category: z.enum(['Company', 'Technology', 'Guides']),
  author: text(120), coverImage: image, coverAlt: text(500),
  aiIllustration: z.boolean().default(false),
  publishedAt: z.iso.date(), readTime: text(60),
  published: z.boolean().default(true), featured: z.boolean().default(false),
  content: z.array(z.object({
    heading: text(250), paragraphs: z.array(text(12000)).min(1).max(40),
    bullets: z.array(text(2000)).max(40).optional(),
  })).min(1).max(30),
})
export const dealerSchema = z.object({
  showroom: text(180), region: text(100), city: text(100), address: text(1000),
  phone: z.string().trim().max(30).regex(/^[+\d\s()-]*$/).optional().default(''),
  hours: z.string().trim().max(200).optional().default(''),
  published: z.boolean().default(true),
})
export const settingsSchema = z.object({
  name: text(120), tagline: text(250), email: z.email().max(200),
  phone: text(30).regex(/^[+\d\s()-]{8,30}$/), address: text(1000),
})
export const messageSchema = z.object({
  name: text(120), email: z.email().max(200),
  phone: text(30).regex(/^[+\d\s()-]{8,30}$/),
  model: z.string().trim().max(100).optional().default(''),
  message: z.string().trim().min(10).max(8000),
})
export const adminRoleSchema = z.object({
  phone: text(30).regex(/^[+\d\s()-]{8,30}$/), role: z.enum(['user', 'admin']),
})
