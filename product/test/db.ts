import { env } from 'cloudflare:workers';

export async function resetInstanceState(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM instance_meta'),
    env.DB.prepare('DELETE FROM github_app'),
    env.DB.prepare('DELETE FROM oauth_states'),
    env.DB.prepare('DELETE FROM sessions'),
    env.DB.prepare('DELETE FROM reviewer_repositories'),
    env.DB.prepare('DELETE FROM reviewers'),
    env.DB.prepare('DELETE FROM repositories'),
    env.DB.prepare('DELETE FROM run_reviewers'),
    env.DB.prepare('DELETE FROM runs'),
    env.DB.prepare('DELETE FROM webhook_deliveries'),
  ]);
}
