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
}
