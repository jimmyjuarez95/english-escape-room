import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Browser-safe client: uses the anon key, which only has SELECT on
// public-read tables per supabase/schema.sql RLS policies. Safe to import
// from client components.
export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
