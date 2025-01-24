import multer from 'multer'
import { Request } from 'express'
import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import { logger } from '../utils/logger'

// Configure upload directory
const UPLOAD_DIR = 'uploads/images'
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// Configure storage
const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, UPLOAD_DIR)
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    cb(
      null,
      `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`
    )
  },
})

// File filter
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Accept only images
  if (file.mimetype.startsWith('image/')) {
    cb(null, true)
  } else {
    cb(new Error('Only image files are allowed'))
  }
}

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
})

// Image processing configuration
interface ProcessImageOptions {
  width?: number
  height?: number
  quality?: number
}

export const processImage = async (
  filePath: string,
  options: ProcessImageOptions = {}
): Promise<string> => {
  try {
    const {
      width = 800,  // Default max width
      height = 800, // Default max height
      quality = 80  // Default quality
    } = options

    const optimizedFilePath = filePath.replace(
      /(\.[^.]+)$/,
      `-optimized$1`
    )

    await sharp(filePath)
      .resize(width, height, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality })
      .png({ quality: Math.floor(quality * 0.8) }) // PNG quality is 0-100
      .toFile(optimizedFilePath)

    // Remove original file
    await fs.promises.unlink(filePath)

    return optimizedFilePath
  } catch (error) {
    logger.error('Error processing image:', error)
    throw error
  }
}

// Function to delete image
export const deleteImage = async (filename: string): Promise<void> => {
  const filePath = path.join(UPLOAD_DIR, filename)
  try {
    await fs.promises.unlink(filePath)
  } catch (error) {
    logger.error('Error deleting image:', error)
    throw error
  }
}

// Function to get image URL
export const getImageUrl = (filename: string): string => {
  return `/uploads/images/${filename}`
}

// Function to validate image path
export const isValidImagePath = (imagePath: string): boolean => {
  const normalizedPath = path.normalize(imagePath)
  return normalizedPath.startsWith(UPLOAD_DIR)
}

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
]

export const getContentType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}
