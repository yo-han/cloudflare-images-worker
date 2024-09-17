import { handleImageRequest } from '../index';
import { Env } from '../types';

// Mock console.warn and console.error
const originalWarn = console.warn;
const originalError = console.error;

describe('handleImageRequest', () => {
  let mockEnv: Env;
  let mockRequest: Request;

  beforeAll(() => {
    console.warn = jest.fn();
    console.error = jest.fn();
  });

  afterAll(() => {
    console.warn = originalWarn;
    console.error = originalError;
  });

  beforeEach(() => {
    mockEnv = {
      R2_IMAGES_BUCKET: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn(),
      } as unknown as R2Bucket,
      API_TOKEN: 'mock-api-token',
      ACCOUNT_ID: 'mock-account-id',
      ACCOUNT_HASH: 'mock-account-hash',
      LIVE_SOURCE_URL: 'https://mock-source.com',
      LIVE_PUBLIC_DOMAIN: 'https://mock-public.com',
      KV_STORE: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn(),
      } as unknown as KVNamespace,
      RATELIMIT_ENABLED: false,
      UPLOAD_FROM_SOURCE: true,
      CACHE_KEY_PREFIX: 'mock-cache-key-prefix',
    };

    mockRequest = new Request('https://worker.dev/test-image-thumbnail.jpg');
    
    // Mock fetch to simulate Cloudflare API response
    globalThis.fetch = jest.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));
  });

  it('should return a 400 response when id or variant is missing', async () => {
    const badRequest = new Request('https://worker.dev/');
    const response = await handleImageRequest(badRequest, mockEnv);
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Invalid image URL');
  });

  it('should attempt to fetch from cache first', async () => {
    await handleImageRequest(mockRequest, mockEnv);
    expect(mockEnv.R2_IMAGES_BUCKET.get).toHaveBeenCalled();
  });

  it('should handle CloudflareApiError when fetching original image fails', async () => {
    const response = await handleImageRequest(mockRequest, mockEnv);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('Cloudflare API Error: Failed to upload image');
  });
});