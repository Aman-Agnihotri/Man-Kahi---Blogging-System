import type { ApiError } from '~/types/admin';

/** Normalizes an ofetch/$fetch error (or anything else) into a consistent ApiError shape. */
export function normalizeApiError(error: any): ApiError {
  const data = error?.data;
  if (data && typeof data.message === 'string') {
    return {
      message: data.message,
      details: data.details,
      errors: data.errors,
      status: error?.statusCode ?? error?.status,
    };
  }
  return {
    message: error?.message || 'Something went wrong. Please try again.',
    status: error?.statusCode ?? error?.status,
  };
}
