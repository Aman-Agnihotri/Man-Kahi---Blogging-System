import multer from 'multer'
import crypto from 'crypto'
import path from 'path'
import { Request } from 'express'
import sharp from 'sharp'
import { env } from '@config/env'
import { uploadImage } from '@utils/minio'

// In-memory storage
const storage = multer.memoryStorage()

// File filter
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (!env.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(new Error('Invalid file type'))
    return
  }
  cb(null, true)
}

// Multer upload configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_FILE_SIZE, // e.g., 5MB
  },
})

// Process uploaded image
export const processImage = async (file: Express.Multer.File): Promise<string> => {
  try {
    // Generate unique filename
    const filename = `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname)}`
    
    // Process image with Sharp
    const processedImageBuffer = await sharp(file.buffer)
      .resize(1200, 1200, { // Max dimensions
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 }) // Convert to JPEG with 80% quality
      .toBuffer()

    // Create new file object with processed buffer
    const processedFile: Express.Multer.File = {
      ...file,
      buffer: processedImageBuffer,
      size: processedImageBuffer.length,
      mimetype: 'image/jpeg',
    }

    // Upload to MinIO
    const imageUrl = await uploadImage(processedFile, filename)
    
    return imageUrl
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    throw new Error(`Error processing image: ${errorMessage}`)
  }
}
