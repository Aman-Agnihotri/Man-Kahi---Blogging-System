import { PrismaClient, Prisma } from "@prisma/client";
import logger from "./logger";

export { Prisma };

declare global {
    namespace NodeJS {
        interface Global {
            prismaClient: PrismaClient | undefined;
        }
    }
}

// Custom error type for Prisma-specific errors
export class PrismaError extends Error {
    constructor(
        message: string,
        public code?: string,
        public meta?: Record<string, any>
    ) {
        super(message);
        this.name = "PrismaError";
    }
}

// Configuration types
interface PrismaClientConfig {
    log?: boolean;
    connectionRetries?: number;
    connectionTimeout?: number;
    queryTimeout?: number;
}

interface TransactionOptions {
    timeout?: number;
    maxWait?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
}

// Query/Transaction event types
interface QueryEvent {
    timestamp: Date;
    query: string;
    params: string;
    duration: number;
    target: string;
}

interface LogEvent {
    timestamp: Date;
    message: string;
    target?: string;
}

// Extend PrismaClient to include typings for event handlers
interface ExtendedPrismaClient extends PrismaClient {
    $on(event: 'query', listener: (event: QueryEvent) => void): void;
    $on(event: 'info' | 'warn' | 'error', listener: (event: LogEvent) => void): void;
}

/**
 * Enhanced PrismaClient creation with comprehensive configuration and monitoring
 */
function createPrismaClient(config: PrismaClientConfig = {}): ExtendedPrismaClient {
    const {
        log = process.env['NODE_ENV'] !== "production",
        connectionRetries = 3,
        connectionTimeout = 5000,
        queryTimeout = 30000
    } = config;

    const logOptions: Prisma.PrismaClientOptions['log'] = log ? [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
    ] : undefined;

    // Initialize client with advanced configuration
    const client = new PrismaClient({
        log: logOptions,
        errorFormat: 'minimal',
        datasources: {
            db: {
                url: process.env['DATABASE_URL'],
            },
        },
    }) as ExtendedPrismaClient;

    // Query monitoring and logging
    if (log) {
        client.$on('query', (e: QueryEvent) => {
            logger.debug({
                query: e.query,
                params: e.params,
                duration: `${e.duration}ms`,
                timestamp: new Date().toISOString()
            }, 'Query');
        });
    }

    // Error monitoring
    client.$on('error', (e: LogEvent) => {
        logger.error({
            message: e.message,
            target: e.target,
            timestamp: new Date().toISOString()
        }, 'Prisma Client Error');
    });

    // Info logging
    client.$on('info', (e: LogEvent) => {
        logger.info({
            message: e.message,
            timestamp: new Date().toISOString()
        }, 'Prisma Client Info');
    });

    // Warning logging
    client.$on('warn', (e: LogEvent) => {
        logger.warn({
            message: e.message,
            timestamp: new Date().toISOString()
        }, 'Prisma Client Warning');
    });

    // Enhanced connection management
    let connectionAttempts = 0;
    const ensureConnection = async () => {
        try {
            await Promise.race([
                client.$connect(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Connection timeout')), connectionTimeout)
                )
            ]);
            connectionAttempts = 0;
            logger.info('Successfully connected to database');
        } catch (error) {
            connectionAttempts++;
            logger.error({ err: error }, `Database connection attempt ${connectionAttempts} failed`);

            if (connectionAttempts < connectionRetries) {
                const delay = Math.min(1000 * Math.pow(2, connectionAttempts), 10000);
                logger.info(`Retrying connection in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return ensureConnection();
            }

            throw new PrismaError(
                'Failed to connect to database after multiple attempts',
                'CONNECTION_FAILED'
            );
        }
    };

    // Initialize connection
    ensureConnection().catch((error) => {
        logger.error({ err: error }, 'Fatal: Could not establish database connection');
        process.exit(1);
    });

    // Graceful shutdown handling
    process.on('beforeExit', async () => {
        await prismaHelpers.disconnect();
    });

    return client;
}

/**
 * PrismaClient singleton implementation with enhanced features
 */
class PrismaClientSingleton {
    private static instance: ExtendedPrismaClient | undefined;

    private constructor() {}

    static getInstance(config?: PrismaClientConfig): ExtendedPrismaClient {
        if (!PrismaClientSingleton.instance) {
            PrismaClientSingleton.instance = createPrismaClient(config);
        }
        return PrismaClientSingleton.instance;
    }

    static async resetInstance(): Promise<void> {
        if (PrismaClientSingleton.instance) {
            await PrismaClientSingleton.instance.$disconnect();
            PrismaClientSingleton.instance = undefined;
        }
    }
}

// Configuration for Prisma Client
const prismaConfig: PrismaClientConfig = {
    log: process.env['NODE_ENV'] !== "production",
    connectionRetries: Number(process.env['PRISMA_CONNECTION_RETRIES']) || 3,
    connectionTimeout: Number(process.env['PRISMA_CONNECTION_TIMEOUT']) || 5000,
    queryTimeout: Number(process.env['PRISMA_QUERY_TIMEOUT']) || 30000,
};

// Export singleton instance
export const prisma = PrismaClientSingleton.getInstance(prismaConfig);

// Export commonly used types
export type {
    User,
    Blog,
    Category,
    Tag,
    BlogTag,
    BlogAnalytics,
    Role,
    UserRole,
    OAuthProvider,
    Permission,
    RolePermission,
    CacheControl,
    AnalyticsEvent
} from '@prisma/client';

// Export extended types with relations
export type ExtendedUser = Prisma.UserGetPayload<{
    include: {
        blogs: true;
        roles: {
            include: {
                role: {
                    include: {
                        permissions: {
                            include: {
                                permission: true
                            }
                        }
                    }
                }
            }
        };
        oAuthProviders: true;
    }
}>;

export type ExtendedBlog = Prisma.BlogGetPayload<{
    include: {
        author: true;
        category: true;
        tags: {
            include: {
                tag: true
            }
        };
        analytics: true;
        revision: true;
    }
}>;

// Helper functions for common operations
export const prismaHelpers = {
    /**
     * Safely disconnect from the database
     */
    async disconnect() {
        try {
            await prisma.$disconnect();
            logger.info('Disconnected from database');
        } catch (error) {
            logger.error({ err: error }, 'Error disconnecting from database');
            throw error;
        }
    },

    /**
     * Check database connection health
     */
    async healthCheck() {
        try {
            await prisma.$queryRaw`SELECT 1`;
            return true;
        } catch (error) {
            logger.error({ err: error }, 'Database health check failed');
            return false;
        }
    },

    /**
     * Execute query with retry mechanism
     */
    async withRetry<T>(
        operation: () => Promise<T>,
        options: { retries?: number; delay?: number; timeout?: number } = {}
    ): Promise<T> {
        const { retries = 3, delay = 1000, timeout = 30000 } = options;
        
        try {
            return await Promise.race([
                operation(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Operation timeout')), timeout)
                )
            ]) as T;
        } catch (error) {
            if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.withRetry(operation, {
                    retries: retries - 1,
                    delay: delay * 2,
                    timeout
                });
            }
            throw error;
        }
    },

    /**
     * Execute a transaction with comprehensive error handling
     */
    async transaction<T>(
        fn: (tx: Prisma.TransactionClient) => Promise<T>,
        options: TransactionOptions = {}
    ): Promise<T> {
        const { timeout = 30000, maxWait = 5000, isolationLevel } = options;

        try {
            return await Promise.race([
                prisma.$transaction(fn, {
                    maxWait,
                    timeout,
                    isolationLevel
                }),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Transaction timeout')), timeout)
                )
            ]) as T;
        } catch (error) {
            logger.error({ err: error }, 'Transaction failed');
            throw new PrismaError(
                'Transaction failed',
                'TRANSACTION_FAILED',
                { error }
            );
        }
    },

    /**
     * Clear database cache
     */
    async clearCache() {
        try {
            await prisma.cacheControl.deleteMany({});
            logger.info('Cache cleared successfully');
        } catch (error) {
            logger.error({ err: error }, 'Failed to clear cache');
            throw error;
        }
    }
};

// Handle graceful shutdown
const handleShutdown = async () => {
    try {
        await prismaHelpers.disconnect();
        process.exit(0);
    } catch (error) {
        logger.error({ err: error }, 'Error during shutdown');
        process.exit(1);
    }
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

export default prisma;
