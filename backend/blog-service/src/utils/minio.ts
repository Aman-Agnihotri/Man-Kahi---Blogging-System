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

const BUCKET_NAME = env.MINIO_BUCKET_BLOG
// MINIO_PUBLIC_URL (not MINIO_ENDPOINT, which is the internal Docker
// hostname the client above connects through) - this is what ends up in
// Blog.coverImage and gets rendered directly in <img> tags across the
// frontend, so it must be reachable from the browser. Only used when
// MINIO_SKIP_BUCKET_SETUP is not 'true' (public-bucket mode).
const IMAGE_BASE_URL = `${env.MINIO_PUBLIC_URL}/${BUCKET_NAME}`

export const setupMinio = async (): Promise<void> => {
  if (env.MINIO_SKIP_BUCKET_SETUP === 'true') {
    // Bucket is pre-created and private in cloud deployments.
    return;
  }

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
    logger.error({ err: error }, 'Error setting up MinIO')
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

    const imageUrl = env.MINIO_SKIP_BUCKET_SETUP === 'true'
      ? `/api/blogs/images/${filename}`
      : `${IMAGE_BASE_URL}/${filename}`
    logger.info(`Uploaded image: ${imageUrl}`)
    return imageUrl
  } catch (error) {
    logger.error({ err: error }, 'Error uploading image to MinIO')
    throw error
  }
}

export const deleteImage = async (filename: string): Promise<void> => {
  try {
    await minioClient.removeObject(BUCKET_NAME, filename)
    logger.info(`Deleted image: ${filename}`)
  } catch (error) {
    logger.error({ err: error }, 'Error deleting image from MinIO')
    throw error
  }
}

export const getImageUrl = (filename: string): string => {
  return env.MINIO_SKIP_BUCKET_SETUP === 'true'
    ? `/api/blogs/images/${filename}`
    : `${IMAGE_BASE_URL}/${filename}`
}

// Presigned GET URL for private-bucket mode (MINIO_SKIP_BUCKET_SETUP='true') -
// used by the GET /images/:key route to redirect callers to a short-lived,
// authenticated URL instead of relying on a public bucket policy.
export const getImageObjectUrl = async (key: string): Promise<string> => {
  return minioClient.presignedGetObject(BUCKET_NAME, key, 3600)
}
