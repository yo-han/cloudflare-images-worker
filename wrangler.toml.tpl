name = "<worker_name>"
main = "./src/index.ts"
compatibility_date = "2022-06-30"

kv_namespaces = [
  { binding = "KV_STORE", id = "<kv_namespace_id>" }
]

[vars]
API_TOKEN = "<cloudflare-api-token>"
ACCOUNT_ID = "<account_id>"
ACCOUNT_HASH = "<account_hash>"
LIVE_SOURCE_URL = "https://cdn.example.com/path/"
LIVE_PUBLIC_DOMAIN = "https://cf.example.com"
CACHE_KEY_PREFIX = "<cachekey_prefix>"
RATELIMIT_ENABLED = <rate_limit>
UPLOAD_FROM_SOURCE = <upload_from_source>

[[ r2_buckets ]]
binding = "R2_IMAGES_BUCKET"
bucket_name = "<bucket_name>"