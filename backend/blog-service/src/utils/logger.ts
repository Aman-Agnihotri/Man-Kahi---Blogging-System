import pino from 'pino'

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard',
    },
  },
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
})

// Export a type-safe error logging function
export const logError = (message: string, error: unknown): void => {
  if (error instanceof Error) {
    logger.error(`${message}: ${error.message}`)
    if (error.stack) {
      logger.debug(error.stack)
    }
  } else {
    logger.error(`${message}: Unknown error type`, { error })
  }
}
