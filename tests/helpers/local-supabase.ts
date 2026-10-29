import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Fixture credentials stay in memory and are read only from this checkout's
// running local Studio container. Never accept a remote URL or user-provided key.
export function localDockerSupabase() {
  const containers = JSON.parse(execFileSync('docker', ['inspect', 'supabase_studio_closet'], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }));
  const container = containers[0];
  const labels = container?.Config?.Labels;
  if (labels?.['com.supabase.cli.project'] !== 'closet' || resolve(labels['com.supabase.cli.workdir']).toLowerCase() !== resolve('.').toLowerCase()) throw new Error('Only this checkout local Supabase may be tested');
  const env = Object.fromEntries((container.Config.Env as string[]).map((entry) => { const index = entry.indexOf('='); return [entry.slice(0, index), entry.slice(index + 1)]; }));
  const ANON_KEY = env.SUPABASE_ANON_KEY;
  const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_KEY;
  for (const [key, role] of [[ANON_KEY, 'anon'], [SERVICE_ROLE_KEY, 'service_role']]) {
    if (!key || JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role !== role) throw new Error('Local fixture credentials unavailable');
  }
  return { API_URL: 'http://127.0.0.1:54321', ANON_KEY: ANON_KEY!, SERVICE_ROLE_KEY: SERVICE_ROLE_KEY! };
}
