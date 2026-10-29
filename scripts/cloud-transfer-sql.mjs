import { Buffer } from 'node:buffer';
export const transferTables = ['auth.users', 'auth.identities', 'public.profiles', 'public.categories', 'public.category_preferences', 'public.brands', 'public.wardrobe_items', 'public.item_images', 'public.outfits', 'public.outfit_items', 'public.wear_events', 'public.wear_event_items', 'public.import_jobs'];

// JSON is a quoted SQL value, never interpolated as identifiers or executable SQL.
const literal = value => `convert_from(decode('${Buffer.from(JSON.stringify(value)).toString('base64')}', 'base64'),'UTF8')::jsonb`;
export function transferSql(snapshot) {
  if (!snapshot || Object.keys(snapshot.tables).sort().join() !== [...transferTables].sort().join() || transferTables.some(name => !Array.isArray(snapshot.tables[name]))) throw new Error('지원하지 않는 이전 데이터 구조입니다.');
  const guards = transferTables.filter(name => name !== 'public.categories').map(name => `if exists(select 1 from ${name}) then raise exception 'Target is not empty: ${name}'; end if;`).join('\n');
  const statements = transferTables.map(name => {
    const rows = name === 'public.categories' ? snapshot.tables[name].filter(row => row.user_id !== null) : snapshot.tables[name];
    return rows.length ? `
      relation := '${name}'::regclass;
      payload := ${literal(rows)};
      if exists(select 1 from jsonb_array_elements(payload) r cross join lateral jsonb_object_keys(r) key where not exists(select 1 from pg_attribute a where a.attrelid=relation and a.attnum>0 and not a.attisdropped and a.attname=key)) then raise exception 'Source columns are incompatible: ${name}'; end if;
      select string_agg(quote_ident(attname),',' order by attnum) into columns from pg_attribute where attrelid=relation and attnum>0 and not attisdropped and attgenerated='';
      execute format('insert into %s (%s) select %s from jsonb_populate_recordset(null::%s, $1)', relation,columns,columns,relation) using payload;
    ` : '';
  }).join('\n');
  const global = snapshot.tables['public.categories'].filter(row => row.user_id === null);
  // Both directions must match: migration seed rows cannot silently mask changes.
  return `begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $closet_guard$ begin
${guards}
if (select jsonb_agg(to_jsonb(c) order by c.slug) from public.categories c where user_id is null) is distinct from (select jsonb_agg(r order by r->>'slug') from jsonb_array_elements(${literal(global)}) r) then raise exception 'Canonical categories differ'; end if;
end $closet_guard$;
-- Restore existing IDs/hashes without re-running signup/update side effects.
set local session_replication_role = replica;
do $closet_import$ declare relation regclass; payload jsonb; columns text; begin
${statements}
end $closet_import$;
set local session_replication_role = origin;
commit;`;
}

export function verificationSql() {
  return `select jsonb_build_object('tables', jsonb_build_object(${transferTables.map(name => `'${name}', (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from ${name} t)`).join(',')}), 'objects', (select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name) order by bucket_id,name),'[]'::jsonb) from storage.objects)) as snapshot;`;
}
