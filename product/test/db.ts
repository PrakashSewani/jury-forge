import { env } from 'cloudflare:workers';

export async function resetInstanceState(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM instance_meta'),
    env.DB.prepare('DELETE FROM github_app'),
    env.DB.prepare('DELETE FROM oauth_states'),
    env.DB.prepare('DELETE FROM sessions'),
  ]);
}
