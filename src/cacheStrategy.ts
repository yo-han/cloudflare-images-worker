// cacheStrategy.ts

import { CacheStrategy, CacheOptions } from './types';
import { CONFIG } from './config';

export const cacheStrategy: CacheStrategy = {
  async get(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
    return await bucket.get(key);
  },

  async set(bucket: R2Bucket, key: string, value: Response, options?: CacheOptions): Promise<void> {
    const arrayBuffer = await value.arrayBuffer();
    await bucket.put(key, arrayBuffer, {
      httpMetadata: value.headers,
      expirationTtl: options?.ttl || CONFIG.DEFAULT_CACHE_TTL
    });
  }
};