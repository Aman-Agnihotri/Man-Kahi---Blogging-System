// Pino only merges a structured-fields object into the log record when it is
// the FIRST argument: logger.info({ reqId, body }, 'message'). Passing the
// object second - logger.info('message', { reqId, body }) - is silently
// dropped (no error, no warning); pino treats a string first argument as a
// printf-style message and ignores trailing args that don't fill a
// placeholder. Every call site in this codebase must use object-first form.
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import createRotatingWriteStream from 'pino-rotating-file-stream';
import path from 'path';
import fs from 'fs';
import { NODE_ENV, LOG_LEVEL } from './constants';

const logger = (() => {
    if (NODE_ENV !== 'test') {
        // Use process.cwd() to get the root directory of the project
        const rootLogDir = path.resolve(process.cwd(), 'logs');
        const pinoLogDir = path.join(rootLogDir, 'pino');

        // Ensure the logs directory and subdirectories for winston and pino exist
        const createLogDirectories = () => {
            if (!fs.existsSync(rootLogDir)) {
                fs.mkdirSync(rootLogDir);
                console.log('Created logs directory in project root');
            }
            if (!fs.existsSync(pinoLogDir)) {
                fs.mkdirSync(pinoLogDir);
                console.log('Created pino logs directory in project root');
            }
        };

        createLogDirectories();

        // Initialize Pino file streams and logger
        const rotatingStream = createRotatingWriteStream({
            filename: `server-${new Date().toISOString().slice(0, 10)}.log`,
            path: pinoLogDir,
            interval: '1d',
            maxFiles: 14,
            size: '20M',
            compress: true
        });

        const consolePretty = pinoPretty({
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'hostname',
            destination: process.stdout
        });

        const filePretty = pinoPretty({
            colorize: false,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
            ignore: 'pid,hostname',
            destination: rotatingStream
        });

        const streams = [
            {
                level: LOG_LEVEL,
                stream: consolePretty
            },
            {
                level: 'debug',
                stream: filePretty
            },
        ];

        return pino(
            {
                level: 'debug',
                timestamp: pino.stdTimeFunctions.isoTime,
                // Every log line carries which service emitted it - without
                // this, `docker compose logs` (which does prefix by
                // container name) is the only way to tell services apart,
                // and any centralized/aggregated log view loses that
                // entirely. SERVICE_NAME is set per-service in
                // docker-compose.yml.
                base: { service: process.env['SERVICE_NAME'] ?? 'unknown-service' }
            },
            pino.multistream(streams)
        );
    } else {
        // In testing environment, initialize a basic logger without file streams
        return pino({
            level: 'silent',
        });
    }
})();

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


export default logger;