import crypto from 'crypto';
import rethink from 'rethinkdbdash';
import pino from 'pino';

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

const md5 = (str) => {
    const md5sum = crypto.createHash('md5');
    md5sum.update(str);
    return md5sum.digest('hex');
};

export default class RethinkDBStore {
    constructor(options) {
        this.client = rethink({
            silent: true,
            host: options.host || '127.0.0.1',
            port: options.port || 28015,
            db: options.db || 'haste',
            user: options.user || 'admin',
            password: options.password || ''
        });
    }

    set(key, data, callback) {
        this.client.table('uploads').insert({ id: md5(key), data }).run((error) => {
            if (error) {
                callback(false);
                logger.error('Failed to insert to table', error);
                return;
            }
            callback(true);
        });
    }

    get(key, callback) {
        this.client.table('uploads').get(md5(key)).run((error, result) => {
            if (error || !result) {
                callback(false);
                if (error) logger.error('Failed to retrieve from table', error);
                return;
            }
            callback(result.data);
        });
    }
}
