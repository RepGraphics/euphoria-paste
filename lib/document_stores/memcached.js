import Memcached from 'memcached';
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

export default class MemcachedDocumentStore {

  // Create a new store with options
  constructor(options) {
    this.expire = options.expire;

    const host = options.host || '127.0.0.1';
    const port = options.port || 11211;
    const url = `${host}:${port}`;
    this.connect(url);
  }

  // Create a connection
  connect(url) {
    this.client = new Memcached(url);

    logger.info(`Connecting to memcached on ${url}`);

    this.client.on('failure', (error) => {
      logger.error('Error connecting to memcached', { error });
    });
  }

  // Save file in a key
  set(key, data, callback, skipExpire) {
    this.client.set(key, data, skipExpire ? 0 : this.expire || 0, (error) => {
      callback(!error);
    });
  }

  // Get a file from a key
  get(key, callback, skipExpire) {
    this.client.get(key, (error, data) => {
      const value = error ? false : data;

      callback(value);

      // Update the key so that the expiration is pushed forward
      if (value && !skipExpire) {
        this.set(key, data, (updateSucceeded) => {
          if (!updateSucceeded) {
            logger.error('Failed to update expiration on GET', { key });
          }
        }, skipExpire);
      }
    });
  }

}
