// Apenas Project URL e chave publicável/anon. NUNCA service_role.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const SUPABASE_URL = 'https://vpxjobpsxvmqtqmnnagr.supabase.co';
const SUPABASE_PUBLIC_KEY = 'sb_publishable_Nz0qS75yjyBBJg9pNStoUg_I0-kmU90';
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
