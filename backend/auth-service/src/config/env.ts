// Auth-service specific environment configuration. Currently scoped to the
// avatar-upload feature (MinIO settings + file constraints) - the rest of
// the service reads process.env directly where needed (see server.ts).
// MinIO env var names intentionally match blog-service's so the same
// docker/compose/.env.development values are reused across services.
type Environment = {
    MAX_AVATAR_FILE_SIZE: number // in bytes
    ALLOWED_IMAGE_TYPES: string[]

    // MinIO Configuration
    MINIO_ENDPOINT: string
    MINIO_PORT: string
    MINIO_USE_SSL: string
    MINIO_ACCESS_KEY: string
    MINIO_SECRET_KEY: string
    MINIO_REGION: string
    // Base URL for image links returned to the browser - distinct from
    // MINIO_ENDPOINT, which is the internal Docker hostname this service
    // uses to talk to the MinIO server directly and is not reachable from
    // outside the Docker network.
    MINIO_PUBLIC_URL: string
    MINIO_BUCKET_AVATARS: string
    MINIO_SKIP_BUCKET_SETUP: string
}

const defaults = {
    // Avatars are resized to 256x256 server-side, so the original upload
    // doesn't need to be nearly as large as blog-service's 5MB cover-image
    // limit.
    MAX_AVATAR_FILE_SIZE: 2 * 1024 * 1024, // 2MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],

    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_USE_SSL: 'false',
    MINIO_ACCESS_KEY: 'minioadmin',
    MINIO_SECRET_KEY: 'minioadmin',
    MINIO_REGION: 'ap-south-1',
    MINIO_PUBLIC_URL: 'http://localhost:9000',
    MINIO_BUCKET_AVATARS: 'avatars',
    MINIO_SKIP_BUCKET_SETUP: 'false',
}

export const env: Environment = {
    MAX_AVATAR_FILE_SIZE: parseInt(process.env['MAX_AVATAR_FILE_SIZE'] ?? String(defaults.MAX_AVATAR_FILE_SIZE), 10),
    ALLOWED_IMAGE_TYPES: process.env['ALLOWED_IMAGE_TYPES']
        ? process.env['ALLOWED_IMAGE_TYPES'].split(',')
        : defaults.ALLOWED_IMAGE_TYPES,

    MINIO_ENDPOINT: process.env['MINIO_ENDPOINT'] ?? defaults.MINIO_ENDPOINT,
    MINIO_PORT: process.env['MINIO_PORT'] ?? defaults.MINIO_PORT,
    MINIO_USE_SSL: process.env['MINIO_USE_SSL'] ?? defaults.MINIO_USE_SSL,
    MINIO_ACCESS_KEY: process.env['MINIO_ACCESS_KEY'] ?? defaults.MINIO_ACCESS_KEY,
    MINIO_SECRET_KEY: process.env['MINIO_SECRET_KEY'] ?? defaults.MINIO_SECRET_KEY,
    MINIO_REGION: process.env['MINIO_REGION'] ?? defaults.MINIO_REGION,
    MINIO_PUBLIC_URL: process.env['MINIO_PUBLIC_URL'] ?? defaults.MINIO_PUBLIC_URL,
    MINIO_BUCKET_AVATARS: process.env['MINIO_BUCKET_AVATARS'] ?? defaults.MINIO_BUCKET_AVATARS,
    MINIO_SKIP_BUCKET_SETUP: process.env['MINIO_SKIP_BUCKET_SETUP'] ?? defaults.MINIO_SKIP_BUCKET_SETUP,
}
