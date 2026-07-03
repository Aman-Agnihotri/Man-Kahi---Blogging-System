import { Client } from 'minio'
import logger from '@shared/utils/logger'
import { env } from '@config/env'

const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(env.MINIO_PORT || '9000'),
  useSSL: env.MINIO_USE_SSL === 'true',
  accessKey: env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: env.MINIO_SECRET_KEY || 'minioadmin',
})

const BUCKET_NAME = 'blog-images'
// MINIO_PUBLIC_URL (not MINIO_ENDPOINT, which is the internal Docker
// hostname the client above connects through) - this is what ends up in
// Blog.coverImage and gets rendered directly in <img> tags across the
// frontend, so it must be reachable from the browser.
const IMAGE_BASE_URL = `${env.MINIO_PUBLIC_URL}/${BUCKET_NAME}`

export const setupMinio = async (): Promise<void> => {
  try {
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME)
    if (!bucketExists) {
      await minioClient.makeBucket(BUCKET_NAME, env.MINIO_REGION || 'us-east-1')
      
      // Set bucket policy to allow public read access
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'PublicRead',
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`],
          },
        ],
      }
      await minioClient.setBucketPolicy(BUCKET_NAME, JSON.stringify(policy))
      
      logger.info(`Created MinIO bucket: ${BUCKET_NAME}`)
    }
  } catch (error) {
    logger.error('Error setting up MinIO:', error)
    throw error
  }
}

export const uploadImage = async (
  file: Express.Multer.File,
  filename: string
): Promise<string> => {
  try {
    // Lazily ensure the bucket exists on first use rather than requiring a
    // separate startup step - setupMinio() was previously defined but never
    // called anywhere, so the "blog-images" bucket was never actually
    // created and every cover-image upload failed with "The specified
    // bucket does not exist" (only ever surfaced now that a real UI
    // exercises this path - see auth-service's uploadAvatar for the same
    // lazy-setup pattern this mirrors).
    await setupMinio()

    await minioClient.putObject(
      BUCKET_NAME,
      filename,
      file.buffer,
      file.size,
      {
        'Content-Type': file.mimetype,
        'Cache-Control': 'max-age=31536000', // 1 year cache
      }
    )

    const imageUrl = `${IMAGE_BASE_URL}/${filename}`
    logger.info(`Uploaded image: ${imageUrl}`)
    return imageUrl
  } catch (error) {
    logger.error('Error uploading image to MinIO:', error)
    throw error
  }
}

export const deleteImage = async (filename: string): Promise<void> => {
  try {
    await minioClient.removeObject(BUCKET_NAME, filename)
    logger.info(`Deleted image: ${filename}`)
  } catch (error) {
    logger.error('Error deleting image from MinIO:', error)
    throw error
  }
}

export const getImageUrl = (filename: string): string => {
  return `${IMAGE_BASE_URL}/${filename}`
}
