# Cloudflare Image Proxy Worker

A Cloudflare Worker for proxying and caching images, with optional rate limiting and a convenient setup process.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Development](#development)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Features

- Proxy images from a source URL to Cloudflare's CDN
- Cache images using Cloudflare R2 for improved performance
- Optional rate limiting to prevent abuse
- TypeScript support for improved developer experience
- Easy configuration and deployment process

## Prerequisites

Before you begin, ensure you have met the following requirements:

- Node.js (v14 or later)
- npm (v6 or later)
- A Cloudflare account with Workers and R2 enabled
- Cloudflare API token with appropriate permissions
- Cloudflare R2 bucket set up for image caching
- Cloudflare KV namespace for rate limiting (if enabled)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/cloudflare-image-proxy-worker.git
   cd cloudflare-image-proxy-worker
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Configuration

1. Run the initialization script:
   ```
   npm run init
   ```

2. Follow the prompts to enter your Cloudflare configuration details. This will create a `.env` file and update your `wrangler.toml` file.

3. (Optional) Manually edit the `.env` file to adjust any settings.

## Usage

Once deployed, the worker will handle image requests in the following format:

```
https://your-worker-subdomain.workers.dev/?id=image-id&variant=image-variant
```

- `id`: The identifier of the image in your source system
- `variant`: The desired variant or size of the image (e.g., 'original', 'thumbnail', etc.)

The worker will fetch the image from your source URL, cache it in R2, and serve it through Cloudflare's CDN.

## Development

To run the worker locally for development:

```
npm run dev
```

This will start a local development server using Wrangler.

## Deployment

To deploy the worker to Cloudflare:

```
npm run deploy
```

This script will update the configuration, build the worker, and deploy it to your Cloudflare account.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the [MIT License](LICENSE).