import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { transferSql, transferTables } from '../scripts/cloud-transfer-sql.mjs';

describe('fresh-project data transfer guards', () => {
  it('quotes data and refuses unknown tables before any target write', () => {
    const tables = Object.fromEntries(transferTables.map(name => [name, []]));
    expect(() => transferSql({ tables: { ...tables, 'public.unknown': [] } })).toThrow();
    const rows = [{ id: 'fixture', display_name: "test'); drop table auth.users; -- $closet_import$" }];
    const fixture = { tables: { ...tables, 'public.profiles': rows } };
    const sql = transferSql(fixture);
    expect(sql).toContain(Buffer.from(JSON.stringify(rows)).toString('base64'));
    expect(sql).not.toContain(rows[0]!.display_name);
    expect(sql.indexOf('Target is not empty')).toBeLessThan(sql.indexOf('session_replication_role = replica'));
    expect(sql).toContain('Canonical categories differ');
    expect(sql).not.toMatch(/truncate|delete from/i);
    expect(sql).toContain('set local session_replication_role = origin;\ncommit;');
  });
});
