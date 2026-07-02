import { Client } from 'minio'
import logger from '@shared/utils/logger'
import { env } from '@config/env'

// This is a service-local copy of blog-service's src/utils/minio.ts, adapted
// for avatars. Each service is a separate deployable with its own
// node_modules/Docker image, so cross-service imports aren't possible - the
// duplication is intentional. It reuses the same MINIO_* env vars as
// blog-service (already present in docker/compose/.env.development).

const minioClient = new Client({
    endPoint: env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(env.MINIO_PORT || '9000'),
    useSSL: env.MINIO_USE_SSL === 'true',
    accessKey: env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: env.MINIO_SECRET_KEY || 'minioadmin',
})

// Distinct bucket from blog-service's "blog-images" to avoid collisions -
// each service owns its own MinIO bucket.
const BUCKET_NAME = 'avatars'
const IMAGE_BASE_URL = `${env.MINIO_ENDPOINT}:${env.MINIO_PORT}/${BUCKET_NAME}`

export const setupMinio = async (): Promise<void> => {
    try {
        const bucketExists = await minioClient.bucketExists(BUCKET_NAME)
        if (!bucketExists) {
            await minioClient.makeBucket(BUCKET_NAME, env.MINIO_REGION || 'us-east-1')

            // Set bucket policy to allow public read access (avatars are
            // rendered directly by <img> tags across the frontend).
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

export const uploadAvatar = async (
    file: Express.Multer.File,
    filename: string
): Promise<string> => {
    try {
        // Lazily ensure the bucket exists on first use rather than requiring
        // a separate startup step - avatar uploads are infrequent enough
        // that the extra bucketExists check is negligible.
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
        logger.info(`Uploaded avatar: ${imageUrl}`)
        return imageUrl
    } catch (error) {
        logger.error('Error uploading avatar to MinIO:', error)
        throw error
    }
}

export const deleteAvatar = async (filename: string): Promise<void> => {
    try {
        await minioClient.removeObject(BUCKET_NAME, filename)
        logger.info(`Deleted avatar: ${filename}`)
    } catch (error) {
        logger.error('Error deleting avatar from MinIO:', error)
        throw error
    }
}
