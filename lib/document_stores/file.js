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
        this.basePath = options.path || './data';
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

    // Save data in a file, key as md5
    async set(key, data) {
        const filePath = path.join(this.basePath, FileDocumentStore.md5(key));
        try {
            await fs.writeFile(filePath, data, 'utf8');
            logger.info(`Data saved to file: ${filePath}`);
            return true;
        } catch (err) {
            logger.error('Error saving data to file', { error: err, filePath });
            return false;
        }
    }

    // Get data from a file by key
    async get(key) {
      const filePath = path.join(this.basePath, FileDocumentStore.md5(key));
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
