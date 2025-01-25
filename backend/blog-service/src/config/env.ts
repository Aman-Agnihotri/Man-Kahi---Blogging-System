type Environment = {
  NODE_ENV: string
  PORT: number
  DATABASE_URL: string
  REDIS_URL: string
  ELASTICSEARCH_URL: string
  JWT_SECRET: string
  STORAGE_PATH: string
  FRONTEND_URL: string
  MAX_FILE_SIZE: number // in bytes
  ALLOWED_IMAGE_TYPES: string[]
  
  // MinIO Configuration
  MINIO_ENDPOINT: string
  MINIO_PORT: string
  MINIO_USE_SSL: string
  MINIO_ACCESS_KEY: string
  MINIO_SECRET_KEY: string
  MINIO_REGION: string
}

const defaults = {
  NODE_ENV: 'development',
  PORT: 3002,
  DATABASE_URL: 'postgresql://user:password@localhost:5432/mankahi_blog',
  REDIS_URL: 'redis://localhost:6379',
  ELASTICSEARCH_URL: 'http://localhost:9200',
  JWT_SECRET: 'your-secret-key',
  STORAGE_PATH: './uploads',
  FRONTEND_URL: 'http://localhost:3000',
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  
  // MinIO defaults
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: '9000',
  MINIO_USE_SSL: 'false',
  MINIO_ACCESS_KEY: 'minioadmin',
  MINIO_SECRET_KEY: 'minioadmin',
  MINIO_REGION: 'us-east-1'
}

export const env: Environment = {
  NODE_ENV: process.env.NODE_ENV ?? defaults.NODE_ENV,
  PORT: parseInt(process.env.PORT ?? String(defaults.PORT), 10),
  DATABASE_URL: process.env.DATABASE_URL ?? defaults.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL ?? defaults.REDIS_URL,
  ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL ?? defaults.ELASTICSEARCH_URL,
  JWT_SECRET: process.env.JWT_SECRET ?? defaults.JWT_SECRET,
  STORAGE_PATH: process.env.STORAGE_PATH ?? defaults.STORAGE_PATH,
  FRONTEND_URL: process.env.FRONTEND_URL ?? defaults.FRONTEND_URL,
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE ?? String(defaults.MAX_FILE_SIZE), 10),
  ALLOWED_IMAGE_TYPES: process.env.ALLOWED_IMAGE_TYPES ? 
    process.env.ALLOWED_IMAGE_TYPES.split(',') : 
    defaults.ALLOWED_IMAGE_TYPES,

  // MinIO Configuration
  MINIO_ENDPOINT: process.env.MINIO_ENDPOINT ?? defaults.MINIO_ENDPOINT,
  MINIO_PORT: process.env.MINIO_PORT ?? defaults.MINIO_PORT,
  MINIO_USE_SSL: process.env.MINIO_USE_SSL ?? defaults.MINIO_USE_SSL,
  MINIO_ACCESS_KEY: process.env.MINIO_ACCESS_KEY ?? defaults.MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY: process.env.MINIO_SECRET_KEY ?? defaults.MINIO_SECRET_KEY,
  MINIO_REGION: process.env.MINIO_REGION ?? defaults.MINIO_REGION
}
