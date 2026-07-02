import { defineStore } from 'pinia';
import type { AuthResponse, LoginCredentials, RegisterCredentials, User, AuthError } from '~/types/auth';

// Auth primitives (login/register/logout/refresh) intentionally use a plain
// $fetch against the API base URL rather than useApi(): useApi() retries
// once on 401 by calling refreshSession() itself, which would recurse
// forever if the refresh call is the one that 401s.
function authFetch<T>(path: string, opts: { method: string; body?: any; token?: string }): Promise<T> {
  const config = useRuntimeConfig();
  return $fetch<T>(path, {
    baseURL: config.public.apiUrl as string,
    method: opts.method as any,
    body: opts.body,
    headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined,
  });
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    loading: false,
    error: null as AuthError | null,
    token: null as string | null,
    refreshToken: null as string | null,
    initialized: false,
  }),

  getters: {
    isAuthenticated: (state) => !!state.token && !!state.user,
    isAdmin: (state) => state.user?.roles.includes('admin') ?? false,
  },

  actions: {
    async register(credentials: RegisterCredentials) {
      this.loading = true;
      this.error = null;

      try {
        if (!this.validatePassword(credentials.password)) {
          throw new Error('Password must be at least 8 characters and contain uppercase, lowercase, and numbers');
        }

        const data = await authFetch<AuthResponse>('/api/auth/register', {
          method: 'POST',
          body: credentials,
        });

        this.setAuthData(data);
        return data;
      } catch (error: any) {
        const normalized = normalizeApiError(error);
        this.error = { message: normalized.message, code: 'REGISTRATION_ERROR' };
        throw this.error;
      } finally {
        this.loading = false;
      }
    },

    async login(credentials: LoginCredentials) {
      this.loading = true;
      this.error = null;

      try {
        const data = await authFetch<AuthResponse>('/api/auth/login', {
          method: 'POST',
          body: credentials,
        });

        this.setAuthData(data);
        return data;
      } catch (error: any) {
        const normalized = normalizeApiError(error);
        this.error = { message: normalized.message, code: 'LOGIN_ERROR' };
        throw this.error;
      } finally {
        this.loading = false;
      }
    },

    async loginWithGoogle() {
      if (import.meta.client) {
        const config = useRuntimeConfig();
        window.location.href = `${config.public.apiUrl}/api/auth/google`;
      }
    },

    async logout() {
      this.loading = true;
      this.error = null;

      try {
        if (this.token) {
          await authFetch('/api/auth/logout', { method: 'POST', token: this.token });
        }
        this.clearAuthData();
      } catch (error: any) {
        // Even if the server call fails, the user should still be logged
        // out locally - a stale/expired token shouldn't block logout.
        this.clearAuthData();
        const normalized = normalizeApiError(error);
        this.error = { message: normalized.message, code: 'LOGOUT_ERROR' };
      } finally {
        this.loading = false;
      }
    },

    /** Returns true if the session was refreshed, false otherwise (never throws). */
    async refreshSession(): Promise<boolean> {
      if (!this.refreshToken) {
        this.clearAuthData();
        return false;
      }

      try {
        const data = await authFetch<AuthResponse>('/api/auth/refresh', {
          method: 'POST',
          body: { refreshToken: this.refreshToken },
        });

        this.setAuthData(data);
        return true;
      } catch {
        this.clearAuthData();
        return false;
      }
    },

    validatePassword(password: string): boolean {
      const minLength = 8;
      const hasUpper = /[A-Z]/.test(password);
      const hasLower = /[a-z]/.test(password);
      const hasNumber = /\d/.test(password);

      return password.length >= minLength && hasUpper && hasLower && hasNumber;
    },

    setAuthData(data: AuthResponse) {
      this.token = data.token;
      this.refreshToken = data.refreshToken;
      this.user = data.user;

      if (import.meta.client) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('refresh_token', data.refreshToken);
      }
    },

    clearAuthData() {
      this.token = null;
      this.refreshToken = null;
      this.user = null;

      if (import.meta.client) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
      }
    },

    /** Restores session from localStorage on app boot. Safe to call multiple times. */
    async initAuth() {
      if (this.initialized || !import.meta.client) return;
      this.initialized = true;

      const token = localStorage.getItem('auth_token');
      const refreshToken = localStorage.getItem('refresh_token');

      if (token && refreshToken) {
        this.token = token;
        this.refreshToken = refreshToken;
        await this.refreshSession();
      }
    },
  },
});
