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
export const JWT_EXPIRATION = getEnvVar('JWT_EXPIRATION', '15m');

export const LOG_LEVEL = getEnvVar('LOG_LEVEL', 'info');

export const NODE_ENV = getEnvVar('NODE_ENV');

if (NODE_ENV !== 'test' && NODE_ENV !== 'dev' && NODE_ENV !== 'prod') {
    console.error(`Invalid NODE_ENV: ${NODE_ENV}`);
    throw new Error(`Invalid NODE_ENV: ${NODE_ENV}`);
}

const isTestEnv = NODE_ENV === "test";

export const rateLimitConfig = {
    ip: {
        windowMs: isTestEnv ? 1000 : 10 * 60 * 1000, // 10 minutes or 1 second in test environment
        limit: isTestEnv ? 100 : 5000                // 5000 requests per 10 minutes or 100 per second in test
    },
    login: {
        windowMs: isTestEnv ? 1000 : 15 * 60 * 1000, // 15 minutes or 1 second in test environment
        limit: isTestEnv ? 5 : 10                    // 10 requests per 15 minutes or 5 per second in test
    },
    registration: {
        windowMs: isTestEnv ? 1000 : 15 * 60 * 1000, // 15 minutes or 1 second in test environment
        limit: isTestEnv ? 5 : 10                    // 10 requests per 15 minutes or 5 per second in test
    },
    token_refresh: {
        windowMs: isTestEnv ? 1000 : 15 * 60 * 1000, // 15 minutes or 1 second in test environment
        limit: 5                                                           // 5 requests per 15 minutes
    },
    oauth: {
        windowMs: isTestEnv ? 1000 : 15 * 60 * 1000, // 15 minutes or 1 second in test environment
        limit: isTestEnv ? 5 : 10                    // 10 requests per 15 minutes or 5 per second in test
    },
    roles: {
        admin: { 
            points: isTestEnv ? 50 : 10_000,         // 10,000 requests per hour or 50 requests per second in test
            duration: isTestEnv ? 1 : 60 * 60
        },
        writer: { 
            points: isTestEnv ? 25 : 5_000,          // 5,000 requests per hour or 25 requests per second in test
            duration: isTestEnv ? 1 : 60 * 60
        },
        reader: { 
            points: isTestEnv ? 100 : 1_000,         // 1,000 requests per hour or 100 requests per second in test
            duration: isTestEnv ? 1 : 60 * 60
        }
    }
};

export const getRateLimitConfig = () => rateLimitConfig;

// Allowed IP addresses for rate limit bypass for testing
export const rateLimitBypassIp = "244.128.248.221";

export const testIP = "123.45.67.89";
export const testReaderIP = "217.137.153.227";
export const testAdminIP = "198.15.177.9";