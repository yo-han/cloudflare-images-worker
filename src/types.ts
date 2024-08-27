// types.ts

/**
 * Environment variables and bindings for the Cloudflare Worker.
 */
export interface Env {
  IMAGES_CACHE: R2Bucket;
  ACCOUNT_ID: string;
  API_TOKEN: string;
  ACCOUNT_HASH: string;
  LIVE_SOURCE_URL: string;
  LIVE_PUBLIC_DOMAIN: string;
  KV_STORE: KVNamespace;
}

/**
 * Interface for the response from Cloudflare Images API.
 */
export interface CloudflareImageResponse {
  result: {
    id: string;
    filename: string;
    uploaded: string;
    requireSignedURLs: boolean;
    variants: string[];
  };
  success: boolean;
  errors: any[];
  messages: any[];
}

/**
 * Interface for the cache strategy.
 */
export interface CacheStrategy {
  /**
   * Retrieves an item from the cache.
   * @param bucket - The R2 bucket to use for caching.
   * @param key - The cache key.
   * @returns The cached item, or null if not found.
   */
  get(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null>;

  /**
   * Stores an item in the cache.
   * @param bucket - The R2 bucket to use for caching.
   * @param key - The cache key.
   * @param value - The value to cache.
   * @param options - Optional caching options (e.g., TTL).
   */
  set(bucket: R2Bucket, key: string, value: Response, options?: CacheOptions): Promise<void>;
}

/**
 * Options for caching.
 */
export interface CacheOptions {
  ttl?: number; // Time-to-live in seconds
}

/**
 * Interface for metrics tracking.
 */
export interface Metrics {
  /**
   * Increments a counter metric.
   * @param name - The name of the metric.
   * @param value - The value to increment by (default: 1).
   */
  incrementCounter(name: string, value?: number): void;

  /**
   * Records a timing metric.
   * @param name - The name of the metric.
   * @param value - The timing value in milliseconds.
   */
  recordTiming(name: string, value: number): void;
}

/**
 * Configuration options for the worker.
 */
export interface Config {
  CLOUDFLARE_API_BASE: string;
  IMAGE_DELIVERY_URL: string;
  RATE_LIMIT_WINDOW: number;
  MAX_REQUESTS_PER_WINDOW: number;
  DEFAULT_CACHE_TTL: number;
}

export interface R2PutOptions {
  onlyIf?: Headers | R2Conditional;
  expirationTtl?: number;

}