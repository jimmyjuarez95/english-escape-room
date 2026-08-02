import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Service-role client: bypasses RLS. Only ever import this from Route
// Handlers / server code — the `server-only` import above makes any
// accidental client-component import a build error instead of a leaked key.
export function createServiceRoleClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
