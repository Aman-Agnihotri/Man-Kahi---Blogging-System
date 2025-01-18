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
                timestamp: pino.stdTimeFunctions.isoTime
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

export default logger;