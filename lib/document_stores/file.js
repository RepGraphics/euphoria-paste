import fs from 'fs/promises'; // Use promises-based fs module
import crypto from 'crypto';
import path from 'path';
import pino from 'pino';

// Configure Pino logger
const logger = pino({
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
        },
    },
});

export default class FileDocumentStore {
    constructor(options) {
        this.basePath = path.resolve(options.path || './data');
        this.expire = options.expire;

        // Ensure basePath exists
        fs.mkdir(this.basePath, { recursive: true })
            .then(() => logger.info(`Directory ensured: ${this.basePath}`))
            .catch((err) => logger.error('Failed to ensure directory', { error: err }));
    }

    // Generate md5 of a string
    static md5(str) {
        const md5sum = crypto.createHash('md5');
        md5sum.update(str);
        return md5sum.digest('hex');
    }

    async set(key, data) {
        const filePath = path.join(this.basePath, FileDocumentStore.md5(key));
        logger.info(`Saving data with key: ${key} to file: ${filePath}`);
        try {
            await fs.writeFile(filePath, data, 'utf8');
            logger.info(`Data saved to file: ${filePath}`);
            return true;
        } catch (err) {
            logger.error('Error saving data to file', { error: err, filePath });
            return false;
        }
    }
    
    async get(key) {
        const filePath = path.join(this.basePath, FileDocumentStore.md5(key));
        logger.info(`Retrieving data with key: ${key} from file: ${filePath}`);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            logger.info(`Data read from file: ${filePath}`);
            return data;
        } catch (err) {
            if (err.code === 'ENOENT') {
                logger.warn(`File not found: ${filePath}`);
            } else {
                logger.error('Error reading data from file', { error: err, filePath });
            }
            return null;
        }
    }
    
}
