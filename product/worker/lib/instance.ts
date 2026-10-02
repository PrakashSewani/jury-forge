export async function getMeta(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT value FROM instance_meta WHERE key = ?')
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export async function setMeta(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare(
      'INSERT INTO instance_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    )
    .bind(key, value)
    .run();
}

export async function deleteMeta(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM instance_meta WHERE key = ?').bind(key).run();
}

export async function isClaimed(db: D1Database): Promise<boolean> {
  return (await getMeta(db, 'claimed_at')) !== null;
}
