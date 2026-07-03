interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  query?: Record<string, any>;
  headers?: Record<string, string>;
}

/**
 * Thin typed wrapper over Nuxt's $fetch. All calls run client-side only
 * (pages use `useAsyncData(..., { server: false })`), so the public
 * gateway URL (browser-reachable) is always the correct base - there is no
 * separate server-side base to reason about.
 */
export function useApi() {
  const config = useRuntimeConfig();
  const baseURL = config.public.apiUrl as string;

  async function request<T>(path: string, opts: ApiRequestOptions = {}, _isRetry = false): Promise<T> {
    const auth = useAuthStore();
    const headers: Record<string, string> = { ...opts.headers };
    if (auth.token) {
      headers.Authorization = `Bearer ${auth.token}`;
    }

    try {
      return await $fetch<T>(path, {
        baseURL,
        method: opts.method ?? 'GET',
        body: opts.body,
        query: opts.query,
        headers,
      });
    } catch (error: any) {
      const status = error?.statusCode ?? error?.status;
      if (status === 401 && auth.isAuthenticated && !_isRetry) {
        const refreshed = await auth.refreshSession().catch(() => false);
        if (refreshed) {
          return request<T>(path, opts, true);
        }
        auth.clearAuthData();
        await navigateTo('/auth/login');
      }
      throw normalizeApiError(error);
    }
  }

  return {
    get: <T>(path: string, query?: Record<string, any>) => request<T>(path, { method: 'GET', query }),
    post: <T>(path: string, body?: any) => request<T>(path, { method: 'POST', body }),
    put: <T>(path: string, body?: any) => request<T>(path, { method: 'PUT', body }),
    patch: <T>(path: string, body?: any) => request<T>(path, { method: 'PATCH', body }),
    del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
    /** DELETE with a JSON body (e.g. re-confirming a password before account deletion). */
    delWithBody: <T>(path: string, body?: any) => request<T>(path, { method: 'DELETE', body }),
    /** For multipart/form-data requests (blog cover image upload). */
    postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
    putForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'PUT', body: form }),
  };
}
