# Cloudflare Image Proxy Worker

To prevent exorbitant Cloudflare bills, I developed this worker after several unsuccessful attempts with other repositories. The major advantage of this solution is that you can use Cloudflare image resizing without incurring excessive costs.

### How it works

- For each request, the worker checks if the image is available in your Cloudflare R2 bucket in the requested variation.
- If not found, it requests the original from your Cloudflare Images account, resizes it, and stores it in the R2 bucket. This eliminates the need for future resizing of the same image.
- If the original is missing from the Images account, the worker attempts to upload it using a live source URL that matches the requested image.

This approach significantly reduces the number of image transformations performed by Cloudflare, thereby minimizing costs while still leveraging Cloudflare's powerful image resizing capabilities. 

### Disclaimer

While this worker is designed to help manage costs, bugs can happen and unforeseen issues may arise. Always monitor your usage and costs when implementing any new solution.

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
https://your-worker-subdomain.workers.dev/<id>-<variant>.png
```

- `id`: The image name or path to find the image on the old server and use as id in R2
- `variant`: The desired variant or size of the image (e.g., 'original', 'thumbnail', etc.) as created in Cloudflare images

The worker will fetch the image from your source URL, cache it in R2, and serve it through Cloudflare's CDN.

**Response:**

The image response will be a binary if it is found on R2 or Cloudflare Images. If it's needed to be uploaded from the source url you will be redirect to the new path of the image on your configured live domain:

```
# Without variant
https://cdn.example.com/id.extension

# With variant
https://cdn.example.com/id-variant.extension
```



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