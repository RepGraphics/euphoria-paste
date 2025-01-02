import { Pool } from 'pg';
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

// create table entries (id serial primary key, key varchar(255) not null, value text not null, expiration int, unique(key));

export default class PostgresDocumentStore {
  constructor(options) {
    this.expireJS = parseInt(options.expire, 10);

    const connectionString = process.env.DATABASE_URL || options.connectionUrl;
    this.pool = new Pool({ connectionString });
  }

  // Set a given key
  set(key, data, callback, skipExpire) {
    const now = Math.floor(Date.now() / 1000);
    this.safeConnect((err, client, done) => {
      if (err) return callback(false);

      client.query(
        'INSERT INTO entries (key, value, expiration) VALUES ($1, $2, $3)',
        [
          key,
          data,
          this.expireJS && !skipExpire ? this.expireJS + now : null
        ],
        (err) => {
          if (err) {
            logger.error('Error persisting value to postgres', { error: err });
            callback(false);
          } else {
            callback(true);
          }
          done();
        }
      );
    });
  }

  // Get a given key's data
  get(key, callback, skipExpire) {
    const now = Math.floor(Date.now() / 1000);
    this.safeConnect((err, client, done) => {
      if (err) return callback(false);

      client.query(
        'SELECT id, value, expiration FROM entries WHERE key = $1 AND (expiration IS NULL OR expiration > $2)',
        [key, now],
        (err, result) => {
          if (err) {
            logger.error('Error retrieving value from postgres', { error: err });
            callback(false);
          } else {
            callback(result.rows.length ? result.rows[0].value : false);

            if (result.rows.length && this.expireJS && !skipExpire) {
              client.query(
                'UPDATE entries SET expiration = $1 WHERE id = $2',
                [this.expireJS + now, result.rows[0].id],
                (updateErr) => {
                  if (!updateErr) {
                    done();
                  }
                }
              );
            } else {
              done();
            }
          }
        }
      );
    });
  }

  // A connection wrapper
  safeConnect(callback) {
    this.pool.connect((error, client, done) => {
      if (error) {
        logger.error('Error connecting to postgres', { error });
        callback(error);
      } else {
        callback(undefined, client, done);
      }
    });
  }
}
