import { handleImageRequest } from '../index';
import { Env } from '../types';

// Mock console.warn and console.error
const originalWarn = console.warn;
const originalError = console.error;

const ACCOUNT_HASH = 'mock-account-hash';
const CACHE_KEY_PREFIX = 'mock-cache-key-prefix';

// Stand-ins for the two kinds of bytes Cloudflare can hand out: the raw upload
// (full EXIF, GPS included) and a named variant with metadata: none.
const ORIGINAL_BYTES = 'ORIGINAL-UPLOAD-WITH-EXIF';
const VARIANT_BYTES = 'STRIPPED-VARIANT';

const variantUrl = (id: string, variant: string) =>
  `https://imagedelivery.net/${ACCOUNT_HASH}/${id}/${variant}`;

describe('handleImageRequest', () => {
  let mockEnv: Env;
  let mockRequest: Request;

  const fetchMock = () => globalThis.fetch as jest.Mock;
  const fetchedUrls = () => fetchMock().mock.calls.map(([url]) => String(url));
  const r2Keys = (method: 'get' | 'put') =>
    (mockEnv.R2_IMAGES_BUCKET[method] as unknown as jest.Mock).mock.calls.map(([key]) => key);

  /**
   * Routes every outgoing fetch. The `/blob` endpoint answers with the original
   * bytes, so any code path that still reaches it would serve them.
   */
  const routeFetch = (routes: { variantOk: boolean; uploadOk?: boolean }) => {
    fetchMock().mockImplementation(async (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith('/blob')) {
        return new Response(ORIGINAL_BYTES, { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }
      if (url.startsWith('https://imagedelivery.net/')) {
        return routes.variantOk
          ? new Response(VARIANT_BYTES, { status: 200, headers: { 'content-type': 'image/jpeg' } })
          : new Response('Not Found', { status: 404 });
      }
      if (url.endsWith('/images/v1')) {
        return routes.uploadOk
          ? new Response('{"success":true}', { status: 200 })
          : new Response('{"success":false}', { status: 409 });
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    });
  };

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
      ACCOUNT_HASH,
      LIVE_SOURCE_URL: 'https://mock-source.com',
      LIVE_PUBLIC_DOMAIN: 'https://mock-public.com',
      KV_STORE: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn(),
      } as unknown as KVNamespace,
      RATELIMIT_ENABLED: false,
      UPLOAD_FROM_SOURCE: true,
      CACHE_KEY_PREFIX,
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

  it('should handle CloudflareApiError when the variant is missing and the upload from source fails', async () => {
    const response = await handleImageRequest(mockRequest, mockEnv);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('Cloudflare API Error: Failed to upload image');
  });

  it('serves a sized URL from its own named variant and cache key', async () => {
    routeFetch({ variantOk: true });

    const response = await handleImageRequest(
      new Request('https://worker.dev/erice-trappani-upload-239571-200x150.jpeg'),
      mockEnv
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(VARIANT_BYTES);
    expect(fetchedUrls()).toEqual([variantUrl('erice-trappani-upload-239571', '200x150')]);
    expect(r2Keys('get')).toEqual([`${CACHE_KEY_PREFIX}/erice-trappani-upload-239571/200x150`]);
    expect(r2Keys('put')).toEqual([`${CACHE_KEY_PREFIX}/erice-trappani-upload-239571/200x150`]);
  });

  // climbfinder-api#2559: the size-less URL used to serve the uploaded bytes,
  // EXIF and GPS included. It must only ever serve a metadata-stripped variant.
  describe('never serves original bytes', () => {
    it('serves a size-less URL from the stripped 2048x0 variant', async () => {
      routeFetch({ variantOk: true });

      const response = await handleImageRequest(
        new Request('https://worker.dev/erice-trappani-upload-239571.jpeg'),
        mockEnv
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(VARIANT_BYTES);
      expect(fetchedUrls()).toEqual([variantUrl('erice-trappani-upload-239571', '2048x0')]);
      expect(r2Keys('get')).toEqual([`${CACHE_KEY_PREFIX}/erice-trappani-upload-239571/2048x0`]);
      expect(r2Keys('put')).toEqual([`${CACHE_KEY_PREFIX}/erice-trappani-upload-239571/2048x0`]);
    });

    it('does not serve an R2 entry cached under the old original key', async () => {
      // R2 still holds `<prefix>/<id>/original` entries written by the old worker
      // with a one-year TTL. Only that key has content here.
      (mockEnv.R2_IMAGES_BUCKET.get as unknown as jest.Mock).mockImplementation(async (key: string) =>
        key.endsWith('/original')
          ? ({ body: ORIGINAL_BYTES, httpMetadata: { contentType: 'image/jpeg' } } as unknown as R2ObjectBody)
          : null
      );
      routeFetch({ variantOk: true });

      const response = await handleImageRequest(
        new Request('https://worker.dev/erice-trappani-upload-239571.jpeg'),
        mockEnv
      );

      expect(response.headers.get('x-r2-cache')).toBe('MISS');
      expect(await response.text()).toBe(VARIANT_BYTES);
      expect(r2Keys('get').filter((key) => key.endsWith('/original'))).toEqual([]);
    });

    // Every branch after a failed variant fetch. The old worker fell back to
    // `/images/v1/<id>/blob` in all of them, for sized URLs too.
    it.each([
      { path: '/erice-trappani-upload-239571.jpeg', upload: false, uploadOk: false },
      { path: '/erice-trappani-upload-239571-400x300.jpeg', upload: false, uploadOk: false },
      { path: '/erice-trappani-upload-239571.jpeg', upload: true, uploadOk: true },
      { path: '/erice-trappani-upload-239571-400x300.jpeg', upload: true, uploadOk: true },
      { path: '/erice-trappani-upload-239571.jpeg', upload: true, uploadOk: false },
    ])('never fetches the original when the variant fails ($path, upload=$upload, uploadOk=$uploadOk)', async ({ path, upload, uploadOk }) => {
      mockEnv.UPLOAD_FROM_SOURCE = upload;
      routeFetch({ variantOk: false, uploadOk });

      const response = await handleImageRequest(new Request(`https://worker.dev${path}`), mockEnv);

      expect(fetchedUrls().filter((url) => url.endsWith('/blob'))).toEqual([]);
      expect(fetchedUrls().filter((url) => url.endsWith('/original'))).toEqual([]);
      expect(response.status).not.toBe(200);
      expect(await response.text()).not.toContain(ORIGINAL_BYTES);
      expect(mockEnv.R2_IMAGES_BUCKET.put).not.toHaveBeenCalled();
    });

    it('returns the variant error status when the variant fails and upload from source is off', async () => {
      mockEnv.UPLOAD_FROM_SOURCE = false;
      routeFetch({ variantOk: false });

      const response = await handleImageRequest(
        new Request('https://worker.dev/erice-trappani-upload-239571.jpeg'),
        mockEnv
      );

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Cloudflare API Error: Failed to fetch image variant');
    });

    it.each([
      ['/erice-trappani-upload-239571.jpeg', 'https://mock-public.com/erice-trappani-upload-239571.jpeg'],
      ['/erice-trappani-upload-239571-400x300.jpeg', 'https://mock-public.com/erice-trappani-upload-239571-400x300.jpeg'],
    ])('redirects an upload from source back to the requested URL form (%s)', async (path, location) => {
      routeFetch({ variantOk: false, uploadOk: true });

      const response = await handleImageRequest(new Request(`https://worker.dev${path}`), mockEnv);

      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(location);
    });
  });

  // #151: climbfinder.cdn stores the extension as uploaded (29,569 `JPG` rows,
  // plus HEIC/heif/jfif), and the API builds URLs with it as-is. Production
  // serves all of these today; dng/ARW/zip already fail there.
  describe('extension check', () => {
    it.each(['JPG', 'JPEG', 'PNG', 'HEIC', 'heic', 'heif', 'jfif'])(
      'serves a .%s URL from its variant',
      async (ext) => {
        routeFetch({ variantOk: true });

        const response = await handleImageRequest(
          new Request(`https://worker.dev/zwolse-bos-upload-241443-200x150.${ext}`),
          mockEnv
        );

        expect(response.status).toBe(200);
        expect(await response.text()).toBe(VARIANT_BYTES);
        expect(fetchedUrls()).toEqual([variantUrl('zwolse-bos-upload-241443', '200x150')]);
      }
    );

    it.each(['bmp', 'dng', 'ARW', 'zip'])('rejects a .%s URL without fetching anything', async (ext) => {
      routeFetch({ variantOk: true });

      const response = await handleImageRequest(
        new Request(`https://worker.dev/zwolse-bos-upload-241443-200x150.${ext}`),
        mockEnv
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toBe('Invalid image extension');
      expect(fetchedUrls()).toEqual([]);
    });

    it('keeps the extension case in the source URL and the redirect', async () => {
      // The legacy origin may be case-sensitive: `foo.JPG` is not `foo.jpg` there.
      routeFetch({ variantOk: false, uploadOk: true });

      const response = await handleImageRequest(
        new Request('https://worker.dev/zwolse-bos-upload-241443-200x150.JPG'),
        mockEnv
      );

      const uploadCall = fetchMock().mock.calls.find(([url]) => String(url).endsWith('/images/v1'));
      expect((uploadCall?.[1]?.body as FormData).get('url')).toBe(
        'https://mock-source.com/zwolse-bos-upload-241443.JPG'
      );
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(
        'https://mock-public.com/zwolse-bos-upload-241443-200x150.JPG'
      );
    });
  });
});
