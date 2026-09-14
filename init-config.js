const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { renderWranglerToml } = require('./update-config');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const envVariables = [
  { name: 'WORKER_NAME', description: 'The name of your Cloudflare Worker' },
  { name: 'BUCKET', description: 'The name of your Cloudflare R2 bucket' },
  { name: 'ACCOUNT_ID', description: 'Your Cloudflare account ID' },
  { name: 'ACCOUNT_HASH', description: 'Your Cloudflare account hash' },
  { name: 'LIVE_SOURCE_URL', description: 'The live source URL (e.g., https://cdn.example.com/path/)' },
  { name: 'LIVE_PUBLIC_DOMAIN', description: 'The live public domain (e.g., https://cf.example.com)' },
  { name: 'KV_NAMESPACE_ID', description: 'Your KV namespace ID (optional, only needed for rate limiting)' },
  { name: 'CACHE_KEY_PREFIX', description: 'Cache key prefix' },
  { name: 'UPLOAD_FROM_SOURCE', description: 'Upload from source (true/false)' },
  { name: 'RATELIMIT_ENABLED', description: 'Rate limiting enabled (true/false)' }  
];

const envValues = {};

function askQuestion(variable) {
  return new Promise((resolve) => {
    rl.question(`Enter ${variable.description} (${variable.name}): `, (answer) => {
      envValues[variable.name] = answer;
      resolve();
    });
  });
}

function askYesNoQuestion(question) {
  return new Promise((resolve) => {
    rl.question(`${question} (yes/no): `, (answer) => {
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function askQuestions() {
  for (const variable of envVariables) {
    await askQuestion(variable);
  }
  
  // Ask about rate limiting
  const enableRateLimit = await askYesNoQuestion('Do you want to enable rate limiting?');
  envValues['RATELIMIT_ENABLED'] = enableRateLimit ? 'true' : 'false';
}

function writeEnvFile() {
  const envContent = Object.entries(envValues)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync('.env', envContent);
  console.log('.env file has been created successfully.');
}

function updateWranglerToml() {
  const tomlPath = path.join(__dirname, 'wrangler.toml');
  const template = fs.readFileSync(`${tomlPath}.tpl`, 'utf8');
  fs.writeFileSync(tomlPath, renderWranglerToml(template, envValues));
  console.log('wrangler.toml has been updated successfully.');
}

async function init() {
  console.log('Welcome to the Cloudflare Worker configuration setup!');
  await askQuestions();
  writeEnvFile();
  updateWranglerToml();
  console.log('Configuration complete. You can now build and deploy your worker.');
  console.log('Set the Cloudflare API token as a Worker secret first: npx wrangler secret put API_TOKEN');
  rl.close();
}

init();