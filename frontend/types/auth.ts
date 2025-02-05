export interface User {
  id: string;
  email: string;
  username: string;
  roles: string[];
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials extends LoginCredentials {
  username: string;
}

export interface AuthError {
  message: string;
  code: string;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: AuthError | null;
  token: string | null;
  refreshToken: string | null;
}