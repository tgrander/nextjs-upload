export const CONFIG = {
  // Maximum size of each part in bytes (e.g., 10MB)
  PART_SIZE: 10 * 1024 * 1024,

  // Maximum number of concurrent part uploads
  MAX_CONCURRENT_UPLOADS: 5,

  // Base time window for speed calculation in milliseconds (e.g., 5 seconds)
  SPEED_CALCULATION_WINDOW: 5000,

  // Base URL for API endpoints
  API_BASE_URL: "/api",

  // Timeout for API calls in milliseconds (e.g., 3 minutes)
  API_TIMEOUT: 180000,

  // Maximum file size allowed for upload in bytes (e.g., 10GB)
  MAX_FILE_SIZE: 10 * 1024 * 1024 * 1024,

  // Allowed file types for upload
  ALLOWED_FILE_TYPES: ["video/mp4", "video/quicktime", "video/x-msvideo"],

  // IndexedDB database configuration
  DATABASE: {
    NAME: "UploadDB",
    VERSION: 1,
  },

  // Speed tracking configuration
  SPEED_TRACKING: {
    // Minimum data points required for speed calculation
    MIN_DATA_POINTS: 3,

    // Maximum data points to keep for speed calculation
    MAX_DATA_POINTS: 20,

    // Interval for speed updates in milliseconds
    UPDATE_INTERVAL: 1000,

    // Weight for exponential moving average (0-1)
    EMA_WEIGHT: 0.3,
  },

  // Retry configuration
  RETRY: {
    // Number of retry attempts for failed API calls
    ATTEMPTS: 3,

    // Delay between retry attempts in milliseconds
    DELAY: 1000,

    // Maximum time to wait between retries in milliseconds
    MAX_DELAY: 30000,

    // Jitter range for retry delays (±20%)
    JITTER_FACTOR: 0.2,

    // HTTP status codes that should trigger a retry
    STATUS_CODES: [408, 429, 500, 502, 503, 504],

    // Network error types that should trigger a retry
    ERROR_TYPES: ["NetworkError", "TimeoutError", "AbortError", "UploadError"],
  },

  // S3 Transfer Acceleration configuration
  S3_TRANSFER_ACCELERATION: {
    ENABLED: true,

    // Minimum file size to use acceleration (e.g., 512MB)
    MIN_SIZE: 512 * 1024 * 1024,

    // Default acceleration endpoint
    DEFAULT_ENDPOINT: "s3-accelerate.amazonaws.com",
  },
};
