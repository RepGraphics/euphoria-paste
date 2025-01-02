import AWS from 'aws-sdk';
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

export default class AmazonS3DocumentStore {
  constructor(options) {
    this.expire = options.expire;
    this.bucket = options.bucket;
    this.client = new AWS.S3({ region: options.region });
  }

  get(key, callback, skipExpire) {
    const req = {
      Bucket: this.bucket,
      Key: key
    };

    this.client.getObject(req, (err, data) => {
      if (err) {
        logger.error('Error retrieving from Amazon S3', { error: err });
        callback(false);
      } else {
        callback(data.Body.toString('utf-8'));
        if (this.expire && !skipExpire) {
          logger.warn('Amazon S3 store cannot set expirations on keys');
        }
      }
    });
  }

  set(key, data, callback, skipExpire) {
    const req = {
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: 'text/plain'
    };

    this.client.putObject(req, (err) => {
      if (err) {
        logger.error('Error saving to Amazon S3', { error: err });
        callback(false);
      } else {
        callback(true);
        if (this.expire && !skipExpire) {
          logger.warn('Amazon S3 store cannot set expirations on keys');
        }
      }
    });
  }
}
