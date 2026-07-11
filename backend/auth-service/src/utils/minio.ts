import { Client } from 'minio'
import logger from '@shared/utils/logger'
import { env } from '@config/env'

// This is a service-local copy of blog-service's src/utils/minio.ts, adapted
// for avatars. Each service is a separate deployable with its own
// node_modules/Docker image, so cross-service imports aren't possible - the
// duplication is intentional. It reuses the same MINIO_* env vars as
// blog-service (already present in docker/compose/.env.development).
//
// Two modes, gated by MINIO_SKIP_BUCKET_SETUP: when unset/'false' (local
// dev/compose), the bucket is auto-created with a public-read policy and
// User.profileImage stores an absolute MINIO_PUBLIC_URL. When 'true' (cloud
// deployments), the bucket is pre-created and private, setupMinio is a
// no-op, and User.profileImage stores a relative /api/auth/avatars/:key path
// that 302-redirects to a short-lived presigned GET (see getAvatarObjectUrl).

const minioClient = new Client({
    endPoint: env.MINIO_ENDPOINT || 'localhost',
    port: parseInt(env.MINIO_PORT || '9000'),
    useSSL: env.MINIO_USE_SSL === 'true',
    accessKey: env.MINIO_ACCESS_KEY || 'minioadmin',
    secretKey: env.MINIO_SECRET_KEY || 'minioadmin',
})

// Distinct bucket from blog-service's "blog-images" to avoid collisions -
// each service owns its own MinIO bucket.
const BUCKET_NAME = env.MINIO_BUCKET_AVATARS
// MINIO_PUBLIC_URL (not MINIO_ENDPOINT, which is the internal Docker
// hostname the client above connects through) - this is what ends up in
// User.profileImage and gets rendered directly in <img> tags across the
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
        logger.error({ err: error }, 'Error setting up MinIO')
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

        const imageUrl = env.MINIO_SKIP_BUCKET_SETUP === 'true'
            ? `/api/auth/avatars/${filename}`
            : `${IMAGE_BASE_URL}/${filename}`
        logger.info(`Uploaded avatar: ${imageUrl}`)
        return imageUrl
    } catch (error) {
        logger.error({ err: error }, 'Error uploading avatar to MinIO')
        throw error
    }
}

export const deleteAvatar = async (filename: string): Promise<void> => {
    try {
        await minioClient.removeObject(BUCKET_NAME, filename)
        logger.info(`Deleted avatar: ${filename}`)
    } catch (error) {
        logger.error({ err: error }, 'Error deleting avatar from MinIO')
        throw error
    }
}

// Presigned GET URL for private-bucket mode (MINIO_SKIP_BUCKET_SETUP='true') -
// used by the GET /avatars/:key route to redirect callers to a short-lived,
// authenticated URL instead of relying on a public bucket policy.
export const getAvatarObjectUrl = async (key: string): Promise<string> => {
    return minioClient.presignedGetObject(BUCKET_NAME, key, 3600)
}
