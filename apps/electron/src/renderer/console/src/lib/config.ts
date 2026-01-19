/**
 * Centralized configuration for the Electron renderer
 * Production values are hardcoded (publishable/safe to commit)
 * Development values can be overridden via environment variables
 */

// Production API URL (Railway)
const PROD_API_URL = "https://mitablebackend-production.up.railway.app";

// Use env vars in development, hardcoded values in production
export const API_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL || PROD_API_URL
  : PROD_API_URL;
