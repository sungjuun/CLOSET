import { spawnSync } from 'node:child_process';
// Large-pagination fixtures intentionally have a larger admin-assigned plan.
// The browser/API cannot edit app_private.member_limits.
export function setFixtureWardrobeLimit(owner: string, limit: number) {
  if (!/^[a-f0-9-]{36}$/.test(owner) || !Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error('Invalid fixture quota');
  const result = spawnSync('docker', ['exec', 'supabase_db_closet', 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', `insert into app_private.member_limits(user_id,wardrobe_limit) select id,${limit} from auth.users where id='${owner}' and email like '%@example.test' on conflict(user_id) do update set wardrobe_limit=excluded.wardrobe_limit;`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Fixture quota setup failed');
}
