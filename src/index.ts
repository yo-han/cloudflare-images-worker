import { Env } from './types';
import { RateLimiter } from './rateLimiter';
import { CONFIG } from './config';
import { cacheStrategy } from './cacheStrategy';

/**
 * Uploads an image to Cloudflare Images.
 * @param {Env} env - The environment variables.
 * @param {string} sourceUrl - The source URL of the image.
 * @param {string} id - The ID to assign to the image.
 * @returns {Promise<Response>} The upload response.
 * @throws {CloudflareApiError} If the upload fails.
 */
async function uploadToCloudflareImages(env: Env, sourceUrl: string, id: string): Promise<Response> {
  const url = `${CONFIG.CLOUDFLARE_API_BASE}/accounts/${env.ACCOUNT_ID}/images/v1`;
  const formData = new FormData();
  formData.append('url', sourceUrl);
  formData.append('id', id);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.API_TOKEN}` },
    body: formData,
  });

  if (!response.ok) {
    throw new CloudflareApiError('Failed to upload image', response.status, await response.text());
  }

  return response;
}

/**
 * Fetches the original image from Cloudflare Images.
 * @param {Env} env - The environment variables.
 * @param {string} id - The ID of the image.
 * @returns {Promise<Response>} The image response.
 * @throws {CloudflareApiError} If the fetch fails.
 */
async function fetchOriginalCloudflareImage(env: Env, id: string): Promise<Response> {
  const url = `${CONFIG.CLOUDFLARE_API_BASE}/accounts/${env.ACCOUNT_ID}/images/v1/${id}/blob`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${env.API_TOKEN}` },
  });

  // TODO: Create exception for 404 when no live recource is available
  // if (!response.ok) {
  //   throw new CloudflareApiError('Failed to fetch original image', response.status, await response.text());
  // }

  return response;
}

/**
 * Handles an image request.
 * @param {Request} request - The incoming request.
 * @param {Env} env - The environment variables.
 * @returns {Promise<Response>} The image response.
 */
async function handleImageRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.replace(/[^a-zA-Z0-9-_]/g, '-');
  const variant = url.searchParams.get("variant")?.replace(/[^a-zA-Z0-9-_]/g, '');
  const file_path = url.searchParams.get("id")?.replace(/[^a-zA-Z0-9-_\/\.]/g, '-');

  if (!id || !variant) {
    return new Response('Missing id or variant parameter', { status: 400 });
  }

  const bucket = env.R2_IMAGES_BUCKET;
  const cacheKey = `${CONFIG.CACHE_KEY_PREFIX}/${id}/${variant}`;

  try {
    if(CONFIG.RATELIMIT_ENABLED) {
      if (!await RateLimiter.allowRequest(request, env)) {
        throw new RateLimitError('Too many requests');
      }
    }

    const cachedImage = await cacheStrategy.get(bucket, cacheKey);
    if (cachedImage) {
      return createImageResponse(cachedImage, true);
    }

    let imageResponse: Response;
    if (variant === 'original') {
      imageResponse = await fetchOriginalCloudflareImage(env, id);
    } else {
      imageResponse = await fetch(`${CONFIG.IMAGE_DELIVERY_URL}/${env.ACCOUNT_HASH}/${id}/${variant}`);
    }

    if (!imageResponse.ok) {
      const sourceUrl = `${env.LIVE_SOURCE_URL}/${file_path}`
      const uploadResponse = await uploadToCloudflareImages(env, sourceUrl, id);

      if (uploadResponse.ok) {
        const postfix = variant === 'original' ? '' : `-${variant}`;
        return Response.redirect(`${env.LIVE_PUBLIC_DOMAIN}/${file_path}${postfix}`, 302);
      } else {
        throw new CloudflareApiError('Failed to fetch and upload image', uploadResponse.status, await uploadResponse.text());
      }
    }

    await cacheStrategy.set(bucket, cacheKey, imageResponse.clone());
    return createImageResponse(imageResponse, false);
  } catch (error) {
    console.error('Error processing request:', error);
    
    if (error instanceof CloudflareApiError) {
      return new Response(`Cloudflare API Error: ${error.message}`, { status: error.status });
    } else if (error instanceof RateLimitError) {
      return new Response('Rate limit exceeded', { status: 429 });
    } else {
      return new Response('Internal Server Error', { status: 500 });
    }
  }
}

/**
 * Creates a response for an image.
 * @param {Response | R2ObjectBody} response - The image response or R2 object.
 * @param {boolean} isCacheHit - Whether the response was a cache hit.
 * @returns {Response} The final image response.
 */
function createImageResponse(response: Response | R2ObjectBody, isCacheHit: boolean): Response {
  const headers = new Headers((response instanceof Response ? response : response as R2HTTPMetadata)?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'image/jpeg');
  }
  headers.set('x-r2-cache', isCacheHit ? 'HIT' : 'MISS');

  return new Response(response.body, {
    headers,
    status: response instanceof Response ? response.status : 200,
  });
}

export default {
  /**
   * Main entry point for the Cloudflare Worker.
   * @param {Request} request - The incoming request.
   * @param {Env} env - The environment variables.
   * @returns {Promise<Response>} The response to send back.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'GET' } });
    }
    return handleImageRequest(request, env);
  },
};

// Custom error classes
class CloudflareApiError extends Error {
  constructor(message: string, public status: number, public responseBody: string) {
    super(message);
    this.name = 'CloudflareApiError';
  }
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}