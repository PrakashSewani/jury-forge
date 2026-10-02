import { decryptSecret, encryptSecret } from './crypto';
import { normalizePrivateKeyPem } from './private-key';

export interface GitHubApp {
  appId: number;
  slug: string;
  clientId: string;
  privateKey: string;
  webhookSecret: string;
  clientSecret: string;
}

interface GitHubAppRow {
  app_id: number;
  slug: string;
  client_id: string;
  private_key_enc: string;
  webhook_secret_enc: string;
  client_secret_enc: string;
}

export async function loadGitHubApp(
  db: D1Database,
  encryptionKey: CryptoKey,
): Promise<GitHubApp | null> {
  const row = await db
    .prepare(
      'SELECT app_id, slug, client_id, private_key_enc, webhook_secret_enc, client_secret_enc FROM github_app LIMIT 1',
    )
    .first<GitHubAppRow>();
  if (!row) {
    return null;
  }
  return {
    appId: row.app_id,
    slug: row.slug,
    clientId: row.client_id,
    privateKey: await decryptSecret(encryptionKey, row.private_key_enc),
    webhookSecret: await decryptSecret(encryptionKey, row.webhook_secret_enc),
    clientSecret: await decryptSecret(encryptionKey, row.client_secret_enc),
  };
}

export async function storeGitHubApp(
  db: D1Database,
  encryptionKey: CryptoKey,
  app: GitHubApp,
): Promise<void> {
  await db.prepare('DELETE FROM github_app').run();
  await db
    .prepare(
      'INSERT INTO github_app (app_id, slug, client_id, private_key_enc, webhook_secret_enc, client_secret_enc) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(
      app.appId,
      app.slug,
      app.clientId,
      await encryptSecret(encryptionKey, normalizePrivateKeyPem(app.privateKey)),
      await encryptSecret(encryptionKey, app.webhookSecret),
      await encryptSecret(encryptionKey, app.clientSecret),
    )
    .run();
}
