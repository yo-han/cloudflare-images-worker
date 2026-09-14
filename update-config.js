const fs = require('fs');
const path = require('path');

// The `kv_namespaces = [ ... ]` block in wrangler.toml.tpl, including the blank line after it.
const KV_NAMESPACES_BLOCK = /^kv_namespaces = \[[\s\S]*?^\]\n\n?/m;

/**
 * Renders wrangler.toml from the template and a set of configuration values.
 *
 * The KV namespace is only used for rate limiting. Without KV_NAMESPACE_ID the
 * binding is left out instead of deploying a literal `<kv_namespace_id>`, and
 * rate limiting without it is refused.
 *
 * API_TOKEN is never rendered: it is a Worker secret (`wrangler secret put
 * API_TOKEN`), and wrangler refuses a var with the same name as a secret.
 * @param {string} template - Contents of wrangler.toml.tpl.
 * @param {Record<string, string | undefined>} env - Configuration values (e.g. from .env).
 * @returns {string} The rendered wrangler.toml.
 */
function renderWranglerToml(template, env) {
  const rateLimitEnabled = env.RATELIMIT_ENABLED === 'true';
  if (rateLimitEnabled && !env.KV_NAMESPACE_ID) {
    throw new Error('RATELIMIT_ENABLED=true requires KV_NAMESPACE_ID');
  }

  let toml = template;
  if (!env.KV_NAMESPACE_ID) {
    const withoutKv = toml.replace(KV_NAMESPACES_BLOCK, '');
    if (withoutKv === toml) {
      throw new Error('wrangler.toml.tpl has no kv_namespaces block to remove');
    }
    toml = withoutKv;
  }

  const replacements = {
    '<account_id>': env.ACCOUNT_ID,
    '<account_hash>': env.ACCOUNT_HASH,
    'https://cdn.example.com/path/': env.LIVE_SOURCE_URL,
    'https://cf.example.com': env.LIVE_PUBLIC_DOMAIN,
    '<worker_name>': env.WORKER_NAME,
    '<bucket_name>': env.BUCKET,
    '<cachekey_prefix>': env.CACHE_KEY_PREFIX,
    '<kv_namespace_id>': env.KV_NAMESPACE_ID,
    '<rate_limit>': rateLimitEnabled ? 'true' : 'false',
    '<upload_from_source>': env.UPLOAD_FROM_SOURCE === 'true' ? 'true' : 'false'
  };

  for (const [placeholder, value] of Object.entries(replacements)) {
    if (!toml.includes(placeholder)) {
      continue;
    }
    if (!value) {
      console.warn(`Warning: ${placeholder} is not set in .env file`);
      continue;
    }
    toml = toml.replace(placeholder, value);
  }

  return toml;
}

if (require.main === module) {
  require('dotenv').config();
  const tomlPath = path.join(__dirname, 'wrangler.toml');
  const template = fs.readFileSync(`${tomlPath}.tpl`, 'utf8');
  fs.writeFileSync(tomlPath, renderWranglerToml(template, process.env));
  console.log('wrangler.toml has been updated with values from .env');
}

module.exports = { renderWranglerToml };
