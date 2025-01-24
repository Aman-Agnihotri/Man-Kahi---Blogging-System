import * as argon2 from 'argon2'
import { logger } from './logger'

// Configure argon2 with secure defaults
const hashingConfig = {
  // Memory cost: 32MB (default: 64MB)
  memoryCost: 2 ** 15,
  // Time cost: number of iterations (default: 3)
  timeCost: 4,
  // Parallelism: number of parallel threads (default: 1)
  parallelism: 2,
  // Hash length (default: 32)
  hashLength: 32,
  // Algorithm type (default: Argon2id)
  type: argon2.argon2id,
}

export async function hashPassword(password: string): Promise<string> {
  try {
    return await argon2.hash(password, hashingConfig)
  } catch (error) {
    logger.error('Error hashing password:', error)
    throw new Error('Failed to hash password')
  }
}

export async function verifyPassword(
  hashedPassword: string,
  plainPassword: string
): Promise<boolean> {
  try {
    return await argon2.verify(hashedPassword, plainPassword)
  } catch (error) {
    logger.error('Error verifying password:', error)
    throw new Error('Failed to verify password')
  }
}

// For password reset functionality
export async function needsRehash(hash: string): Promise<boolean> {
  try {
    return await argon2.needsRehash(hash, hashingConfig)
  } catch (error) {
    logger.error('Error checking if password needs rehash:', error)
    return false
  }
}
