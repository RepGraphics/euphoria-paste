import pino from 'pino';
import fetch from 'node-fetch';
import Busboy from 'busboy';

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

class DocumentHandler {
    constructor(options = {}) {
        const config = options.config || {}; // Safely access options.config
        this.keyLength = options.keyLength || DocumentHandler.defaultKeyLength;
        this.maxLength = options.maxLength; // none by default
        this.store = options.store;
        this.keyGenerator = options.keyGenerator;

        // Use config.js or .env for Discord webhook URL
        this.discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || config.discordWebhookUrl || null;
        // Debug Discord webhook setup
        if (this.discordWebhookUrl) {
            logger.info(`Discord Webhook URL initialized in DocumentHandler: ${this.discordWebhookUrl}`);
        } else {
            logger.warn('Discord Webhook URL is not configured in DocumentHandler');
        }

    }

    static defaultKeyLength = 10;

    // Function to send logs to Discord
    async sendLogToDiscord(message) {
      if (!this.discordWebhookUrl) {
          logger.warn('Discord webhook URL is not configured');
          return;
      }

      try {
          const res = await fetch(this.discordWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: message }),
          });

          if (!res.ok) {
              const errorText = await res.text();
              throw new Error(`Discord webhook error: ${res.status} - ${res.statusText} - ${errorText}`);
          }

          logger.info('Successfully sent log to Discord');
      } catch (err) {
          logger.error('Failed to send log to Discord', { error: err });
      }
  }

    // Handle retrieving a document
    async handleGet(request, response, config) {
        const key = request.params.id.split('.')[0];
        const documents = config.documents || {}; // Safely access documents
        const skipExpire = !!documents[key];

        try {
            const data = await this.store.get(key);
            if (data) {
                logger.info(`Retrieved document: ${key}`);
                response.writeHead(200, { 'content-type': 'application/json' });
                if (request.method === 'HEAD') {
                    response.end();
                } else {
                    response.end(JSON.stringify({ data, key }));
                }
            } else {
                logger.warn(`Document not found: ${key}`);
                response.writeHead(404, { 'content-type': 'application/json' });
                if (request.method === 'HEAD') {
                    response.end();
                } else {
                    response.end(JSON.stringify({ message: 'Document not found.' }));
                }
            }
        } catch (error) {
            logger.error(`Error retrieving document: ${key}`, { error });
            response.writeHead(500, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ message: 'Error retrieving document.' }));
        }
    }

// Handle retrieving the raw version of a document
async handleRawGet(request, response, config) {
  const key = request.params.id.split('.')[0];
  const documents = config.documents || {};
  const skipExpire = !!documents[key];

  try {
      logger.debug(`Attempting to retrieve raw document: ${key}`);

      // Await the store.get method
      const data = await this.store.get(key, skipExpire);

      if (data) {
          logger.info(`Retrieved raw document: ${key}`);
          response.writeHead(200, { 'content-type': 'text/plain; charset=UTF-8' });
          if (request.method === 'HEAD') {
              logger.debug(`Ending response for HEAD request: ${key}`);
              response.end(); // End response without body
          } else {
              logger.debug(`Sending raw document content: ${key}`);
              response.end(data); // Return the raw document content
          }
      } else {
          logger.warn(`Raw document not found: ${key}`);
          response.writeHead(404, { 'content-type': 'application/json' });
          if (request.method === 'HEAD') {
              logger.debug(`Ending response for HEAD request (not found): ${key}`);
              response.end();
          } else {
              logger.debug(`Sending not found message: ${key}`);
              response.end(JSON.stringify({ message: 'Raw document not found.' }));
          }
      }
  } catch (error) {
      logger.error(`Error retrieving raw document: ${key}`, { error });
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: 'Error retrieving document.' }));
  }
}


// Handle adding a new document
async handlePost(request, response) {
  let buffer = '';
  let cancelled = false;

  const onSuccess = async () => {
      if (this.maxLength && buffer.length > this.maxLength) {
          cancelled = true;
          logger.warn(`Document exceeds maxLength: ${this.maxLength}`);
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ message: 'Document exceeds maximum length.' }));
          return;
      }

      const key = this.keyGenerator.createKey(this.keyLength);
      try {
          // Await the result of saving the document
          const result = await this.store.set(key, buffer);
          if (result) {
              // Infer protocol (default to HTTP if not set)
              const protocol = request.headers['x-forwarded-proto'] || (request.connection.encrypted ? 'https' : 'http');
              const baseUrl = `${protocol}://${request.headers.host}`; // Construct the base URL
              const documentUrl = `${baseUrl}/${key}`; // Full URL to the document
              logger.info(`Added document: ${key}`);
              await this.sendLogToDiscord(`:white_check_mark: A new document was created: ${documentUrl}`);
              response.writeHead(200, { 'content-type': 'application/json' });
              response.end(JSON.stringify({ key }));
          } else {
              throw new Error('Failed to add document');
          }
      } catch (error) {
          logger.error(`Error adding document: ${key}`, { error });
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ message: 'Error adding document.' }));
      }
  };

  const ct = request.headers['content-type'];
  if (ct && ct.split(';')[0] === 'multipart/form-data') {
      const busboy = new Busboy({ headers: request.headers });
      busboy.on('field', (fieldname, val) => {
          if (fieldname === 'data') {
              buffer = val;
          }
      });
      busboy.on('finish', onSuccess);
      request.pipe(busboy);
  } else {
      request.on('data', (data) => {
          buffer += data.toString();
      });
      request.on('end', () => {
          if (!cancelled) {
              onSuccess();
          }
      });
      request.on('error', (error) => {
          logger.error(`Connection error: ${error.message}`);
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ message: 'Connection error.' }));
          cancelled = true;
      });
  }
}

    // Keep choosing keys until one isn't taken
    async chooseKey() {
        while (true) {
            const key = this.keyGenerator.createKey(this.keyLength);
            const existing = await this.store.get(key);
            if (!existing) {
                return key;
            }
        }
    }
}

export default DocumentHandler;
