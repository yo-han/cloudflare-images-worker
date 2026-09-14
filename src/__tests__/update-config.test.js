// Plain JS: update-config.js is a CommonJS build script outside the TypeScript
// project. Renders the real wrangler.toml.tpl from disk, so a template edit that
// breaks the KV handling fails here.
const fs = require('fs');
const path = require('path');
const { renderWranglerToml } = require('../../update-config');

const template = fs.readFileSync(path.join(__dirname, '../../wrangler.toml.tpl'), 'utf8');

const baseEnv = {
  WORKER_NAME: 'image-proxy',
  BUCKET: 'image-cache',
  CACHE_KEY_PREFIX: 'img',
  API_TOKEN: 'token',
  ACCOUNT_ID: 'account',
  ACCOUNT_HASH: 'hash',
  LIVE_SOURCE_URL: 'https://source.example',
  LIVE_PUBLIC_DOMAIN: 'https://image.example',
  RATELIMIT_ENABLED: 'false',
  UPLOAD_FROM_SOURCE: 'false',
};

describe('renderWranglerToml', () => {
  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('binds KV_STORE when a KV namespace id is configured', () => {
    const toml = renderWranglerToml(template, { ...baseEnv, KV_NAMESPACE_ID: 'kv123' });

    expect(toml).toContain('{ binding = "KV_STORE", id = "kv123" }');
  });

  it('omits the KV binding entirely when no KV namespace id is configured', () => {
    const toml = renderWranglerToml(template, baseEnv);

    expect(toml).not.toContain('kv_namespaces');
    expect(toml).not.toContain('<kv_namespace_id>');
    expect(toml).toContain('name = "image-proxy"');
    expect(toml).toContain('bucket_name = "image-cache"');
    expect(toml).toContain('CACHE_KEY_PREFIX = "img"');
    expect(toml).toContain('RATELIMIT_ENABLED = false');
  });

  it('refuses rate limiting without a KV namespace id', () => {
    expect(() => renderWranglerToml(template, { ...baseEnv, RATELIMIT_ENABLED: 'true' })).toThrow(
      'RATELIMIT_ENABLED=true requires KV_NAMESPACE_ID'
    );
  });

  it('keeps rate limiting with a KV namespace id', () => {
    const toml = renderWranglerToml(template, { ...baseEnv, RATELIMIT_ENABLED: 'true', KV_NAMESPACE_ID: 'kv123' });

    expect(toml).toContain('RATELIMIT_ENABLED = true');
    expect(toml).toContain('id = "kv123"');
  });

  // API_TOKEN is a Worker secret. As a [vars] entry it would sit in plaintext in
  // wrangler.toml and the dashboard, and wrangler refuses a var named like an
  // existing secret.
  it('never renders API_TOKEN into [vars], even when it is set', () => {
    const toml = renderWranglerToml(template, { ...baseEnv, API_TOKEN: 'sentinel-images-credential' });

    expect(toml).not.toMatch(/^\s*API_TOKEN\s*=/m);
    expect(toml).not.toContain('<cloudflare-api-token>');
    expect(toml).not.toContain('sentinel-images-credential');
  });
});
