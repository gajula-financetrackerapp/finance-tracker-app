// Supabase Edge Function: purge-frozen-cloud
// Deploy: supabase functions deploy purge-frozen-cloud
// Schedule daily (e.g. 0 3 * * *) via Dashboard → Edge Functions → Schedules.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

Deno.serve(async (_req) => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    return new Response(JSON.stringify({ error: 'Missing env' }), { status: 500 });
  }

  const admin = createClient(url, key);
  const { data, error } = await admin.rpc('purge_expired_cloud_data');
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ purgedUsers: data ?? 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
