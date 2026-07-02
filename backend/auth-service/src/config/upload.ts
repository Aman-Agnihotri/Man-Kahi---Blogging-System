import multer from 'multer'
import crypto from 'crypto'
import { Request } from 'express'
import sharp from 'sharp'
import { env } from '@config/env'
import { uploadAvatar } from '@utils/minio'

// In-memory storage - this is a service-local copy of blog-service's
// src/config/upload.ts, adapted for small square avatars instead of blog
// cover images (see src/utils/minio.ts for why it isn't shared directly).
const storage = multer.memoryStorage()

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!env.ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        cb(new Error('Invalid file type'))
        return
    }
    cb(null, true)
}

export const avatarUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: env.MAX_AVATAR_FILE_SIZE,
    },
})

// Process an uploaded avatar image and store it in MinIO, returning its URL.
export const processAvatarImage = async (file: Express.Multer.File): Promise<string> => {
    try {
        // Output is always re-encoded to JPEG below, so the filename always
        // gets a .jpg extension regardless of the uploaded file's original
        // extension/mimetype.
        const filename = `${crypto.randomBytes(16).toString('hex')}.jpg`

        const processedImageBuffer = await sharp(file.buffer)
            .resize(256, 256, {
                fit: 'cover', // avatars are small square thumbnails - crop to fill rather than letterbox
            })
            .jpeg({ quality: 80 })
            .toBuffer()

        const processedFile: Express.Multer.File = {
            ...file,
            buffer: processedImageBuffer,
            size: processedImageBuffer.length,
            mimetype: 'image/jpeg',
        }

        return await uploadAvatar(processedFile, filename)
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
        throw new Error(`Error processing avatar image: ${errorMessage}`)
    }
}
