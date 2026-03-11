/**
 * Centralized configuration for the Electron renderer
 * Production values are hardcoded (publishable/safe to commit)
 * Development values can be overridden via environment variables
 */

// Production API URL (Railway)
const PROD_API_URL = "https://mitablebackend-production.up.railway.app";

// Development default: local backend; override with VITE_API_URL env var
const DEV_API_URL = "http://localhost:3000";

// Use env vars in development, hardcoded values in production
export const API_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL || DEV_API_URL
  : PROD_API_URL;
