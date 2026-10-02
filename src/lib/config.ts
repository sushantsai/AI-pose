/**
 * Runtime configuration from EXPO_PUBLIC_* env vars (see .env.example).
 * Without Supabase settings the app runs fully offline with built-in suggestions.
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '',
};

export const aiEnabled = Boolean(config.supabaseUrl && config.supabaseKey);
