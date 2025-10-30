// src/constants/config.js
export const APP_CONFIG = {
  RENDER_NETWORK: {
    API_KEY: null, // Will be set by user or environment
    TIMEOUT: 30000,
    RETRY_ATTEMPTS: 3,
    SUPPORTED_FORMATS: ['jpg', 'jpeg', 'png', 'mp4', 'mov']
  },
  
  ARWEAVE: {
    HOST: 'arweave.net',
    PORT: 443,
    PROTOCOL: 'https'
  },
  
  SOLANA: {
    NETWORK: 'devnet', // Change to 'mainnet-beta' for production
    COMMITMENT: 'confirmed'
  },
  
  CAPTURE: {
    MAX_PHOTOS: 1000,
    MAX_VIDEO_DURATION: 600,
    MIN_PHOTOS_FOR_PROCESSING: 8,
    BATCH_SIZE: 50,
    GPS_ACCURACY_THRESHOLD: 5.0, // meters
    RTK_ACCURACY_THRESHOLD: 1.0  // meters
  }
};
