// config.ts

import { Config } from './types';

export const CONFIG: Config = {
  CLOUDFLARE_API_BASE: 'https://api.cloudflare.com/client/v4',
  IMAGE_DELIVERY_URL: 'https://imagedelivery.net',
  
  // Rate limiting configuration
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute in milliseconds
  MAX_REQUESTS_PER_WINDOW: 1000,
  
  // Cache configuration
  DEFAULT_CACHE_TTL: 31536000, // 1 year in seconds
  
};