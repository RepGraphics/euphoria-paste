export default {
  "host": "0.0.0.0",
  "port": 2011,
  "discordWebhookUrl": "",
  "keyLength": 10,
  "maxLength": 400000,
  "staticMaxAge": 86400,
  "recompressStaticAssets": true,
  "ownerDiscordId": "",
  "ownerUsername": "",
  "ownerPassword": "",
  "logging": [
      {
          "level": "verbose",
          "type": "Console",
          "colorize": true
      }
  ],
  "keyGenerator": {
      "type": "phonetic"
  },
  "rateLimits": {
      "categories": {
          "normal": {
              "totalRequests": 500,
              "every": 60000
          }
      }
  },
  "storage": {
      "type": "file"
  },
  "documents": {} // Add this to avoid the undefined error
};
