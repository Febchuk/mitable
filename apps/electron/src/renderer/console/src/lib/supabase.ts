import { createClient } from "@supabase/supabase-js";

// Production values (publishable keys - safe to commit)
const PROD_SUPABASE_URL = "https://lbudgeprqnhellzakkvy.supabase.co";
const PROD_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidWRnZXBycW5oZWxsemFra3Z5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5MTY2NDgsImV4cCI6MjA3ODQ5MjY0OH0.rHnPNtrq7rVb-iy0GYiBzg74XBom8h1DrFSqigLJnI4";

// Use env vars in development, hardcoded values in production
const supabaseUrl = import.meta.env.DEV
  ? (import.meta.env.VITE_SUPABASE_URL || PROD_SUPABASE_URL)
  : PROD_SUPABASE_URL;

const supabaseAnonKey = import.meta.env.DEV
  ? (import.meta.env.VITE_SUPABASE_ANON_KEY || PROD_SUPABASE_ANON_KEY)
  : PROD_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
