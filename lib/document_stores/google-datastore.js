import { Datastore } from '@google-cloud/datastore';
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

export default class GoogleDatastoreDocumentStore {

  // Create a new store with options
  constructor(options) {
    this.kind = "Haste";
    this.expire = options.expire;
    this.datastore = new Datastore();
  }

  // Save file in a key
  set(key, data, callback, skipExpire) {
    const expireTime = (skipExpire || this.expire === undefined) 
      ? null 
      : new Date(Date.now() + this.expire * 1000);

    const taskKey = this.datastore.key([this.kind, key]);
    const task = {
      key: taskKey,
      data: [
        {
          name: 'value',
          value: data,
          excludeFromIndexes: true
        },
        {
          name: 'expiration',
          value: expireTime
        }
      ]
    };

    this.datastore
      .insert(task)
      .then(() => callback(true))
      .catch(err => {
        logger.error('Error inserting document into Google Datastore', { error: err });
        callback(false);
      });
  }

  // Get a file from a key
  get(key, callback, skipExpire) {
    const taskKey = this.datastore.key([this.kind, key]);

    this.datastore
      .get(taskKey)
      .then(([entity]) => {
        if (!entity) {
          logger.info('No document found', { key });
          return callback(false);
        }

        const { value, expiration } = entity;

        if (skipExpire || !expiration) {
          return callback(value);
        }

        if (expiration < new Date()) {
          logger.info('Document expired', { key, expiration, check: new Date() });
          return callback(false);
        }

        // Update expiry
        const updatedTask = {
          key: taskKey,
          data: [
            {
              name: 'value',
              value,
              excludeFromIndexes: true
            },
            {
              name: 'expiration',
              value: new Date(Date.now() + this.expire * 1000)
            }
          ]
        };

        this.datastore
          .update(updatedTask)
          .catch(err => logger.error('Failed to update expiration', { error: err }));

        callback(value);
      })
      .catch(err => {
        logger.error('Error retrieving value from Google Datastore', { error: err });
        callback(false);
      });
  }
}