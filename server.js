// Import necessary modules
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import uglify from 'uglify-js';
import pino from 'pino';
import connect from 'connect';
import route from 'connect-route';
import serveStatic from 'st';
import rateLimit from 'connect-ratelimit';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import config from './config.js';
import DocumentHandler from './lib/document_handler.js';

dotenv.config();

config.port = process.env.PORT || config.port || 7777;
config.host = process.env.HOST || config.host || 'localhost';
config.storage = process.env.STORAGE || config.storage || { type: 'file' };
config.storage.type = process.env.STORAGE_TYPE || config.storage.type || 'file';
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || config.discordWebhookUrl || null;

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

// Function to send logs to Discord
function sendLogToDiscord(message) {
    if (discordWebhookUrl) {
        fetch(discordWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message }),
        }).catch((err) => {
            logger.error('Failed to send log to Discord', { error: err });
        });
    }
}

// Initialize key generator
const { type: keyGenType = 'random', ...keyGenOptions } = config.keyGenerator || {};
const KeyGenerator = (await import(`./lib/key_generators/${keyGenType}.js`)).default;
const keyGenerator = new KeyGenerator(keyGenOptions);

// Initialize the preferred store
let Store;
let preferredStore;
if (process.env.REDISTOGO_URL && config.storage.type === 'redis') {
    const redisClient = (await import('redis-url')).connect(process.env.REDISTOGO_URL);
    Store = (await import('./lib/document_stores/redis.js')).default;
    preferredStore = new Store(config.storage, redisClient);
} else {
    Store = (await import(`./lib/document_stores/${config.storage.type}.js`)).default;
    preferredStore = new Store(config.storage);
}

const documentHandler = new DocumentHandler({
  store: preferredStore,
  maxLength: config.maxLength,
  keyLength: config.keyLength,
  keyGenerator,
  config, // Pass the full config including discordWebhookUrl
});

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Compress static JavaScript assets
if (config.recompressStaticAssets) {
  const staticDir = path.join(__dirname, 'static');
  const files = fs.readdirSync(staticDir);

  files.filter(file => file.endsWith('.js') && !file.endsWith('.min.js')).forEach(file => {
      const filePath = path.join(staticDir, file);
      const minFilePath = filePath.replace(/\.js$/, '.min.js');
      try {
          const code = fs.readFileSync(filePath, 'utf8');
          const minified = uglify.minify(code);

          if (minified.error) {
              logger.error(`Error minifying file: ${file}`, {
                  error: minified.error.message,
                  filePath,
              });
          } else {
              fs.writeFileSync(minFilePath, minified.code, 'utf8');
              logger.info(`Compressed ${file} to ${path.basename(minFilePath)}`);
          }
      } catch (err) {
          logger.error(`Failed to process file: ${file}`, { error: err.message });
      }
  });
}

// Preload static documents
for (const [name, documentPath] of Object.entries(config.documents || {})) {
    try {
        const data = fs.readFileSync(documentPath, 'utf8');
        preferredStore.set(name, data, success => {
            logger.debug(`Loaded static document: ${name}`);
        }, true);
    } catch (err) {
        logger.warn(`Failed to load static document: ${name} - ${err.message}`);
    }
}

const app = connect();

// Apply rate limiting if configured
if (config.rateLimits) {
    app.use(rateLimit({ ...config.rateLimits, end: true }));
}

// Define API routes
app.use(route((router) => {
  router.get('/raw/:id', (req, res) => documentHandler.handleRawGet(req, res, config));
  router.head('/raw/:id', (req, res) => documentHandler.handleRawGet(req, res, config));
  router.get('/documents/:id', (req, res) => documentHandler.handleGet(req, res, config));
  router.post('/documents', (req, res) => documentHandler.handlePost(req, res));
  router.head('/documents/:id', (req, res) => documentHandler.handleGet(req, res, config));
}));


// Serve static files
const staticOptions = {
    path: path.join(__dirname, 'static'),
    content: { maxAge: config.staticMaxAge },
    passthrough: true,
    index: false
};
app.use(serveStatic(staticOptions));

// Fallback to index.html for unmatched routes
app.use(route(router => {
    router.get('/:id', (req, res, next) => {
        // Strip any file extension from the ID
        req.params.id = req.params.id.split('.')[0];
        req.sturl = '/';
        next();
      });
}));
app.use(serveStatic({ ...staticOptions, index: 'index.html' }));

// Start the server
http.createServer(app).listen(config.port, config.host, () => {
    const message = `Server listening on ${config.host}:${config.port}`;
    logger.info(message);
    sendLogToDiscord(message);
});