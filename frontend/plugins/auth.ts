import type { FetchOptions } from 'ofetch';
import type { $Fetch } from 'nitropack';

export default defineNuxtPlugin({
  name: 'auth',
  enforce: 'pre',
  async setup(nuxtApp) {
    // Only initialize auth on client side
    if (import.meta.client) {
      await nuxtApp.runWithContext(async () => {
        try {
          const auth = useAuthStore();
          auth.initAuth();

          // Add auth interceptor for API requests
          const $fetch = nuxtApp.$fetch as $Fetch;

          $fetch.create({
            onRequest({ options }: { options: FetchOptions }) {
              const token = auth.token;
              if (token) {
                options.headers = {
                  ...options.headers,
                  Authorization: `Bearer ${token}`
                };
              }
            },
            onResponseError({ response }: { response: { status: number } }) {
              if (response.status === 401) {
                auth.clearAuthData();
                navigateTo('/auth/login');
              }
            }
          });

          return {
            provide: {
              auth
            }
          };
        } catch (error) {
          console.error('Auth plugin initialization error:', error);
          return {
            provide: {
              auth: null
            }
          };
        }
      });
    }

    // Return empty provider for server-side
    return {
      provide: {
        auth: null
      }
    };
  }
});
