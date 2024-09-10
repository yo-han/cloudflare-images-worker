import { CacheStrategy, CacheOptions, R2PutOptions, R2HTTPMetadata } from './types';
import { CONFIG } from './config';

export const cacheStrategy: CacheStrategy = {
  async get(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
    return await bucket.get(key);
  },

  async set(bucket: R2Bucket, key: string, value: Response, options?: CacheOptions): Promise<void> {
    const arrayBuffer = await value.arrayBuffer();
    
    const httpMetadata: R2HTTPMetadata = {};
    const relevantHeaders = [
      'content-type',
      'content-language',
      'content-disposition',
      'content-encoding',
      'cache-control'
    ];

    relevantHeaders.forEach(header => {
      const headerValue = value.headers.get(header);
      if (headerValue) {
        switch (header) {
          case 'content-type':
            httpMetadata.contentType = headerValue;
            break;
          case 'content-language':
            httpMetadata.contentLanguage = headerValue;
            break;
          case 'content-disposition':
            httpMetadata.contentDisposition = headerValue;
            break;
          case 'content-encoding':
            httpMetadata.contentEncoding = headerValue;
            break;
          case 'cache-control':
            httpMetadata.cacheControl = headerValue;
            break;
        }
      }
    });

    // Handle cache expiry
    const expires = value.headers.get('expires');
    if (expires) {
      httpMetadata.cacheExpiry = new Date(expires);
    }

    const putOptions: R2PutOptions = {
      httpMetadata,
      expirationTtl: options?.ttl || CONFIG.DEFAULT_CACHE_TTL
    };

    await bucket.put(key, arrayBuffer, putOptions);
  }
};