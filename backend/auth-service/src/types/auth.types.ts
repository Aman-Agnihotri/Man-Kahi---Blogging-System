import { User, Role } from '@prisma/client'

export interface AuthRequest extends Request {
    user?: AuthUser
}

export interface AuthUser {
    id: string
    username: string
    email: string
    roles: string[]
}

export interface UserWithRoles extends Omit<User, 'roles'> {
    roles: Role[]
}

export interface LoginResponse {
    token: string
    refreshToken: string
    user: AuthUser
}

export interface RegisterInput {
    username: string
    email: string
    password: string
}

export interface ChangePasswordInput {
    oldPassword: string
    newPassword: string
}

export interface RoleInput {
    name: string
    description?: string
}

export interface UserRole {
    userId: string
    roleId: string
    createdAt: Date
}

export interface TokenPayload {
    userId: string
    email: string
    roles?: string[]
    type?: 'access' | 'refresh'
}

export interface ErrorResponse {
    message: string
    errors?: string[]
}

export interface PaginatedResponse<T> {
    items: T[]
    total: number
    page: number
    limit: number
    totalPages: number
}
