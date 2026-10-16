import { v2 as cloudinary } from 'cloudinary'

import { env } from './env.js'

const isCloudinaryConfigured = Boolean(
  env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret,
)

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
  })
}

export async function uploadImageBuffer(fileBuffer, folder = 'energion/products') {
  if (!isCloudinaryConfigured) {
    throw new Error(
      'Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
    )
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          reject(error)
          return
        }

        resolve({
          publicId: result.public_id,
          secureUrl: result.secure_url,
        })
      },
    )

    stream.end(fileBuffer)
  })
}

export async function deleteImage(publicId, imageUrl = '') {
  if (!isCloudinaryConfigured || !publicId) {
    return
  }

  // Old-account assets are not owned by the configured account.
  if (imageUrl && !imageUrl.includes(`res.cloudinary.com/${env.cloudinaryCloudName}/`)) return
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
  } catch {
    console.warn('Image cleanup could not be completed; the product update was saved.')
  }
}
