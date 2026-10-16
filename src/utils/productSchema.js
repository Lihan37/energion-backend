import { z } from 'zod'

export const galleryImageSchema = z.object({
  url: z.url().refine((value) => value.startsWith('https://'), 'Use an HTTPS image URL.'),
  publicId: z.string().optional().default(''),
  alt: z.string().trim().min(1).max(250),
  caption: z.string().trim().max(250).optional().default(''),
  colour: z.string().trim().max(100).optional().default(''),
})

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required.'),
  slug: z.string().trim().optional().default(''),
  category: z.string().trim().min(2, 'Category is required.'),
  price: z.coerce.number().min(0, 'Price cannot be negative.'),
  battery: z.string().trim().optional().default(''),
  range: z.string().trim().optional().default(''),
  topSpeed: z.string().trim().optional().default(''),
  chargingTime: z.string().trim().optional().default(''),
  colors: z.array(z.string().trim().min(1)).min(1, 'Add at least one color.'),
  shortDescription: z.string().trim().min(10, 'Short description is too short.'),
  description: z.string().trim().min(20, 'Description is too short.'),
  featured: z.boolean().optional().default(false),
  published: z.boolean().optional(),
  tag: z.string().trim().optional().default(''),
  removeImage: z.boolean().optional().default(false),
  primaryImageUrl: z.string().optional(),
  images: z.array(galleryImageSchema).max(30).optional(),
  specs: z
    .array(z.object({ label: z.string().trim().min(1), value: z.string().trim().min(1) }))
    .default([]),
})
