import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { aiEnabled, config } from './config';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!aiEnabled) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    // Refresh tokens only while the app is in the foreground.
    AppState.addEventListener('change', (state) => {
      if (state === 'active') client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}

/**
 * Make sure there is a session. Users are signed in anonymously so the AI
 * quota is tracked per device without asking for an account.
 */
export async function ensureSession(): Promise<SupabaseClient | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session) return supabase;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return supabase;
}
