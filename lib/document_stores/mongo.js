import { MongoClient } from 'mongodb';
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

export default class MongoDocumentStore {
  constructor(options) {
    this.expire = options.expire;
    this.connectionUrl = process.env.DATABASE_URL || options.connectionUrl;
  }

  set(key, data, callback, skipExpire) {
    const now = Math.floor(Date.now() / 1000);

    this.safeConnect((err, db) => {
      if (err) return callback(false);

      db.collection('entries').updateOne(
        {
          entry_id: key,
          $or: [
            { expiration: -1 },
            { expiration: { $gt: now } }
          ]
        },
        {
          $set: {
            entry_id: key,
            value: data,
            expiration: this.expire && !skipExpire ? this.expire + now : -1
          }
        },
        { upsert: true },
        (err) => {
          if (err) {
            logger.error('Error persisting value to MongoDB', { error: err });
            return callback(false);
          }

          callback(true);
        }
      );
    });
  }

  get(key, callback, skipExpire) {
    const now = Math.floor(Date.now() / 1000);

    this.safeConnect((err, db) => {
      if (err) return callback(false);

      db.collection('entries').findOne(
        {
          entry_id: key,
          $or: [
            { expiration: -1 },
            { expiration: { $gt: now } }
          ]
        },
        (err, entry) => {
          if (err) {
            logger.error('Error retrieving value from MongoDB', { error: err });
            return callback(false);
          }

          callback(entry === null ? false : entry.value);

          if (entry !== null && entry.expiration !== -1 && this.expire && !skipExpire) {
            db.collection('entries').updateOne(
              { entry_id: key },
              { $set: { expiration: this.expire + now } },
              (err) => {
                if (err) {
                  logger.error('Error updating expiration in MongoDB', { error: err });
                }
              }
            );
          }
        }
      );
    });
  }

  safeConnect(callback) {
    MongoClient.connect(this.connectionUrl, { useNewUrlParser: true, useUnifiedTopology: true }, (err, client) => {
      if (err) {
        logger.error('Error connecting to MongoDB', { error: err });
        callback(err);
      } else {
        callback(undefined, client.db());
      }
    });
  }
}
