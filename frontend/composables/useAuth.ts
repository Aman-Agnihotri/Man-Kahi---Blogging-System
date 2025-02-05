import { defineStore } from 'pinia';
import type { AuthResponse, LoginCredentials, RegisterCredentials, User, AuthError } from '~/types/auth';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    loading: false,
    error: null as AuthError | null,
    token: null as string | null,
    refreshToken: null as string | null
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

        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials)
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Registration failed');
        }

        this.setAuthData(data);
        return data;
      } catch (error: any) {
        this.error = {
          message: error.message,
          code: 'REGISTRATION_ERROR'
        };
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async login(credentials: LoginCredentials) {
      this.loading = true;
      this.error = null;

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials)
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Login failed');
        }

        this.setAuthData(data);
        return data;
      } catch (error: any) {
        this.error = {
          message: error.message,
          code: 'LOGIN_ERROR'
        };
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async loginWithGoogle() {
      if (import.meta.client) {
        window.location.href = '/api/auth/google';
      }
    },

    async logout() {
      this.loading = true;
      this.error = null;

      try {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.token}`
          }
        });

        if (!response.ok) {
          throw new Error('Logout failed');
        }

        this.clearAuthData();
      } catch (error: any) {
        this.error = {
          message: error.message,
          code: 'LOGOUT_ERROR'
        };
        throw error;
      } finally {
        this.loading = false;
      }
    },

    async refreshSession() {
      if (!this.refreshToken) {
        this.clearAuthData();
        throw new Error('No refresh token');
      }

      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ refreshToken: this.refreshToken })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Session refresh failed');
        }

        this.setAuthData(data);
        return data;
      } catch (error) {
        this.clearAuthData();
        throw error;
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

      // Store tokens in localStorage only on client side
      if (import.meta.client) {
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('refresh_token', data.refreshToken);
      }
    },

    clearAuthData() {
      this.token = null;
      this.refreshToken = null;
      this.user = null;
      
      // Clear localStorage only on client side
      if (import.meta.client) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
      }
    },

    // Initialize auth state from localStorage
    initAuth() {
      if (import.meta.client) {
        const token = localStorage.getItem('auth_token');
        const refreshToken = localStorage.getItem('refresh_token');

        if (token && refreshToken) {
          this.token = token;
          this.refreshToken = refreshToken;
          this.refreshSession().catch(() => this.clearAuthData());
        }
      }
    }
  },
});
