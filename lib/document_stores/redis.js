import redis from 'redis';
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

// For storing in redis
// options[type] = redis
// options[host] - The host to connect to (default localhost)
// options[port] - The port to connect to (default 5379)
// options[db] - The db to use (default 0)
// options[expire] - The time to live for each key set (default never)

export default class RedisDocumentStore {
  constructor(options, client) {
    this.expire = options.expire;
    if (client) {
      logger.info('Using predefined redis client');
      RedisDocumentStore.client = client;
    } else if (!RedisDocumentStore.client) {
      logger.info('Configuring redis');
      RedisDocumentStore.connect(options);
    }
  }

  // Create a connection according to config
  static connect(options) {
    const host = options.host || '127.0.0.1';
    const port = options.port || 6379;
    const index = options.db || 0;
    RedisDocumentStore.client = redis.createClient({ host, port });

    // Authenticate if password is provided
    if (options.password) {
      RedisDocumentStore.client.auth(options.password, (err) => {
        if (err) {
          logger.error('Redis authentication failed', err);
          process.exit(1);
        }
      });
    }

    RedisDocumentStore.client.on('error', (err) => {
      logger.error('Redis disconnected', err);
    });

    RedisDocumentStore.client.select(index, (err) => {
      if (err) {
        logger.error(`Error connecting to redis index ${index}`, { error: err });
        process.exit(1);
      } else {
        logger.info(`Connected to redis on ${host}:${port}/${index}`);
      }
    });
  }

  // Save file in a key
  set(key, data, callback, skipExpire) {
    RedisDocumentStore.client.set(key, data, (err) => {
      if (err) {
        callback(false);
      } else {
        if (!skipExpire) {
          this.setExpiration(key);
        }
        callback(true);
      }
    });
  }

  // Expire a key in expire time if set
  setExpiration(key) {
    if (this.expire) {
      RedisDocumentStore.client.expire(key, this.expire, (err) => {
        if (err) {
          logger.error(`Failed to set expiry on key: ${key}`);
        }
      });
    }
  }

  // Get a file from a key
  get(key, callback, skipExpire) {
    RedisDocumentStore.client.get(key, (err, reply) => {
      if (!err && !skipExpire) {
        this.setExpiration(key);
      }
      callback(err ? false : reply);
    });
  }
}
