import { Request } from 'express'

declare module 'express' {
  export interface Request {
    user?: {
      id: string
      roles: string[]
      [key: string]: unknown
    }
  }
}
