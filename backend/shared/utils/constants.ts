import dotenv from 'dotenv';

dotenv.config();

/**
 * Retrieves the value of an environment variable.
 *
 * @param name - The name of the environment variable to retrieve.
 * @param defaultValue - An optional default value to return if the environment variable is not set.
 * @returns The value of the environment variable, or the default value if provided.
 * @throws Error if the environment variable is not set and no default value is provided.
 */
function getEnvVar(name: string, defaultValue?: string): string {
    const value = process.env[name];

    if (!value) {
        if (defaultValue) {
            return defaultValue;
        } else {
            console.error(`Missing required environment variable: ${name}`);
            throw new Error(`Missing required environment variable: ${name}`);
        }
    }

    return value;
}

export const DATABASE_PROVIDER = getEnvVar('DATABASE_PROVIDER', 'postgresql');
export const DATABASE_URL = getEnvVar('DATABASE_URL');

export const JWT_SECRET = getEnvVar('JWT_SECRET');
export const JWT_ACCESS_EXPIRES_IN = getEnvVar('JWT_ACCESS_EXPIRES_IN', '1h');
export const JWT_REFRESH_EXPIRES_IN = getEnvVar('JWT_REFRESH_EXPIRES_IN', '7d');

export const LOG_LEVEL = getEnvVar('LOG_LEVEL', 'info');

export const NODE_ENV = getEnvVar('NODE_ENV');

if (NODE_ENV !== 'test' && NODE_ENV !== 'development' && NODE_ENV !== 'production') {
    console.error(`Invalid NODE_ENV: ${NODE_ENV}`);
    throw new Error(`Invalid NODE_ENV: ${NODE_ENV}`);
}

const isTestEnv = NODE_ENV === "test";

// Allowed IP addresses for rate limit bypass for testing
export const rateLimitBypassIp = "244.128.248.221";

export const testIP = "123.45.67.89";
export const testReaderIP = "217.137.153.227";
export const testAdminIP = "198.15.177.9";