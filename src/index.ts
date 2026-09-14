import { Env, ParsedImageUrl } from './types';
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

function parseImageUrl(url: string): ParsedImageUrl | null {
  // Regular expression to match both URL patterns
  const regex = /^\/(.+?)(?:-(\d+)x(\d+))?\.([^\.]+)$/;
  const match = url.match(regex);

  if (!match) {
    return null;
  }

  const [, imageId, width, height, extension] = match;

  if (width && height) {
    return {
      id: imageId.replace(/[^a-zA-Z0-9-_]/g, "-"),
      originalPath: imageId,
      width: parseInt(width) || undefined,
      height: parseInt(height) || undefined,
      extension,
      variant: `${width}x${height}`.replace(/[^a-zA-Z0-9-_]/g, ""),
      sizeless: false
    };
  } else {
    // A size-less URL never maps to the original upload: that carries the
    // uploader's EXIF, GPS included.
    return {
      id: imageId.replace(/[^a-zA-Z0-9-_]/g, "-"),
      originalPath: imageId,
      extension,
      variant: CONFIG.SIZELESS_VARIANT,
      sizeless: true
    };
  }
}

/**
 * Handles an image request.
 * @param {Request} request - The incoming request.
 * @param {Env} env - The environment variables.
 * @returns {Promise<Response>} The image response.
 */
export async function handleImageRequest(request: Request, env: Env): Promise<Response> {

  // heic/heif/jfif: stored by the upload paths and served by Cloudflare Images (#151).
  const CLOUDFLARE_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'avif', 'heic', 'heif', 'tif', 'tiff', 'svg'];

  const url = new URL(request.url);
  const parsedImage = parseImageUrl(url.pathname);
	const bucket = env.R2_IMAGES_BUCKET;

    if (!parsedImage) {
      return new Response('Invalid image URL', { status: 400 });
    }

	const { id, originalPath, extension, variant, sizeless } = parsedImage;

  const file_path = originalPath.replace(/[^a-zA-Z0-9-_\/\.]/g, "-");
  const image_path = file_path?.replace(new RegExp(`\\.(${CLOUDFLARE_IMAGE_EXTENSIONS.join('|')})$`, 'i'), '');

  if (!id) {
    return new Response('Missing id parameter', { status: 400 });
  }

  // Case-insensitive: stored extensions keep their upload case (`JPG`). Only the
  // check lowercases; the source URL and redirect keep the case as requested.
  if(!CLOUDFLARE_IMAGE_EXTENSIONS.includes(extension.toLowerCase())) {
    return new Response('Invalid image extension', { status: 400 });
  }

  
  const cacheKey = `${env.CACHE_KEY_PREFIX}/${id}/${variant}`;

  try {
    if(env.RATELIMIT_ENABLED) {
      if (!await RateLimiter.allowRequest(request, env)) {
        throw new RateLimitError('Too many requests');
      }
    }

    const cachedImage = await cacheStrategy.get(bucket, cacheKey);
    if (cachedImage) {
      return createImageResponse(cachedImage, true);
    }

    const imageResponse = await fetch(`${CONFIG.IMAGE_DELIVERY_URL}/${env.ACCOUNT_HASH}/${id}/${variant}`);

    if (imageResponse.ok) {
      await cacheStrategy.set(bucket, cacheKey, imageResponse.clone());
      return createImageResponse(imageResponse, false);
    }

    // No fallback to the original upload (`/images/v1/<id>/blob`) on a failed
    // variant: it returns the uploaded bytes unmodified.
    if (env.UPLOAD_FROM_SOURCE) {
      const sourceUrl = `${env.LIVE_SOURCE_URL}/${image_path}.${extension}`;
      const uploadResponse = await uploadToCloudflareImages(env, sourceUrl, id);

      if (uploadResponse.ok) {
        const postfix = sizeless ? '' : `-${variant}`;
        return Response.redirect(`${env.LIVE_PUBLIC_DOMAIN}/${image_path}${postfix}.${extension}`, 302);
      } else {
        throw new CloudflareApiError('Failed to fetch and upload image', uploadResponse.status, await uploadResponse.text());
      }
    }

    throw new CloudflareApiError('Failed to fetch image variant', imageResponse.status, await imageResponse.text());
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
  let headers = new Headers();
  let body: BodyInit | null = null;
  let status = 200;

  if (response instanceof Response) {
    headers = new Headers(response.headers);
    body = response.body;
    status = response.status;
  } else {
    if (response.httpMetadata) {
      for (const [key, value] of Object.entries(response.httpMetadata)) {
        if (typeof value === 'string') {
          headers.set(key, value);
        }
      }
    }
    body = response.body;
  }

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'image/jpeg');
  }
  headers.set('x-r2-cache', isCacheHit ? 'HIT' : 'MISS');
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(body, { headers, status });
}

/**
 * Deletes every cached R2 variant of an image. Call it after an image changes
 * at the source, so the next GET fetches fresh variants from Cloudflare Images
 * instead of a year-old R2 copy.
 * @param {Request} request - The incoming DELETE request.
 * @param {Env} env - The environment variables.
 * @returns {Promise<Response>} 200 once every variant under the image id is gone.
 */
export async function handleDeleteRequest(request: Request, env: Env): Promise<Response> {
  const parsedImage = parseImageUrl(new URL(request.url).pathname);
  if (!parsedImage || !parsedImage.id) {
    return new Response('Invalid image URL', { status: 400 });
  }

  // Trailing slash: `<prefix>/foo/` must not also match `<prefix>/foo-bar/`.
  const prefix = `${env.CACHE_KEY_PREFIX}/${parsedImage.id}/`;

  try {
    let cursor: string | undefined;
    do {
      const listed = await env.R2_IMAGES_BUCKET.list({ prefix, cursor });
      const keys = listed.objects.map((object) => object.key);
      if (keys.length > 0) {
        await env.R2_IMAGES_BUCKET.delete(keys);
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);

    return new Response('All variants deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Error deleting variants:', { prefix, error });
    return new Response('Internal Server Error', { status: 500 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === '/robots.txt') {
      return new Response('', { status: 200 });
    }

    switch (request.method) {
      case 'GET':
        return handleImageRequest(request, env);
      case 'DELETE':
        return handleDeleteRequest(request, env);
      default:
        return new Response('Method Not Allowed', { status: 405, headers: { 'Allow': 'GET, DELETE' } });
    }
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