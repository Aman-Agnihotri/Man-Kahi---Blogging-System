import { Request, Response, NextFunction } from 'express';
import { blogMetrics } from '../config/metrics';

type ServiceType = 'blog' | 'search';
type OperationStatus = 'success' | 'failure';

// Track service operations timing
export const trackOperationMetrics = (service: ServiceType, operationType: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const endTimer = blogMetrics.operationDuration.startTimer({ 
            service,
            operation: operationType 
        });

        // Track the response after it's sent
        res.on('finish', () => {
            const status = res.statusCode < 400 ? 'success' : 'failure';
            blogMetrics.blogOperations.inc({ 
                service, 
                operation: operationType, 
                status 
            });
            endTimer();
        });

        next();
    };
};

// Track cache hits
export const trackCacheHit = (service: ServiceType, cacheType: string) => {
    blogMetrics.cacheHits.inc({ 
        service,
        cache_type: cacheType,
        operation: 'hit'
    });
};

// Track blog views
export const trackBlogView = (blogId: string) => {
    blogMetrics.blogViews.inc({ blog_id: blogId });
};

// Track search operations
export const trackSearchOperation = (operation: string) => {
    return {
        startTimer: () => {
            const endTimer = blogMetrics.searchDuration.startTimer({ 
                service: 'search',
                operation 
            });
            return {
                end: (status: OperationStatus = 'success') => {
                    blogMetrics.searchOperations.inc({ 
                        service: 'search',
                        operation,
                        status 
                    });
                    endTimer();
                }
            };
        }
    };
};

// Track Elasticsearch operation timing
export const trackElasticsearchOperation = (service: ServiceType, operation: string) => {
    return blogMetrics.elasticsearchLatency.startTimer({ 
        service,
        operation 
    });
};

// Update active blog count
export const updateActiveBlogCount = (delta: number) => {
    blogMetrics.activeBlogCount.inc(delta);
};

// Track storage operations
export const trackStorageOperation = (service: ServiceType, operation: string, storageType: string) => {
    return {
        startTimer: () => {
            const endTimer = blogMetrics.storageLatency.startTimer({ 
                service,
                operation, 
                storage_type: storageType 
            });
            return {
                end: (status: OperationStatus = 'success') => {
                    blogMetrics.storageOperations.inc({ 
                        service,
                        operation, 
                        storage_type: storageType, 
                        status 
                    });
                    endTimer();
                }
            };
        }
    };
};

// Track database operations
export const trackDatabaseOperation = (service: ServiceType, operation: string) => {
    return {
        startTimer: () => {
            const endTimer = blogMetrics.databaseLatency.startTimer({ 
                service,
                operation 
            });
            return {
                end: (status: OperationStatus = 'success') => {
                    blogMetrics.databaseOperations.inc({ 
                        service,
                        operation, 
                        status 
                    });
                    endTimer();
                }
            };
        }
    };
};

// Track cache operations
export const trackCacheOperation = (service: ServiceType, cacheType: string, operation: string) => {
    return {
        startTimer: () => {
            const endTimer = blogMetrics.cacheLatency.startTimer({ 
                service,
                cache_type: cacheType,
                operation 
            });
            return {
                end: (status: OperationStatus = 'success') => {
                    blogMetrics.cacheOperations.inc({ 
                        service,
                        cache_type: cacheType,
                        operation, 
                        status 
                    });
                    endTimer();
                }
            };
        }
    };
};
