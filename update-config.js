// update-config.js

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const tomlPath = path.join(__dirname, 'wrangler.toml');
let tomlContent = fs.readFileSync(`${tomlPath}.tpl`, 'utf8');

const replacements = {
  '<cloudflare-api-token>': process.env.API_TOKEN,
  '<account_id>': process.env.ACCOUNT_ID,
  '<account_hash>': process.env.ACCOUNT_HASH,
  'https://cdn.example.com/path/': process.env.LIVE_SOURCE_URL,
  'https://cf.example.com': process.env.LIVE_PUBLIC_DOMAIN,
  '<worker_name>': process.env.WORKER_NAME,
  '<bucket_name>': process.env.BUCKET,
  '<cachekey_prefix>': process.env.CACHE_KEY_PREFIX,
  '<kv_namespace_id>': process.env.KV_NAMESPACE_ID,
  '<rate_limit>': process.env.RATELIMIT_ENABLED === 'true' ? 'true' : 'false'
};

for (const [placeholder, envValue] of Object.entries(replacements)) {
  if (!envValue) {
    console.warn(`Warning: ${placeholder} is not set in .env file`);
    continue;
  }
  tomlContent = tomlContent.replace(placeholder, envValue);
}

fs.writeFileSync(tomlPath, tomlContent);

console.log('wrangler.toml has been updated with values from .env');