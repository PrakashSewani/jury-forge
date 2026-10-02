import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { hasInstallationAccess } from '../worker/lib/access';
import { network } from './network';

describe('hasInstallationAccess', () => {
  it('finds the installation on the first page', async () => {
    network.use(
      http.get('https://api.github.com/user/installations', () =>
        HttpResponse.json({ total_count: 1, installations: [{ id: 4242 }] }),
      ),
    );
    await expect(hasInstallationAccess('token', 4242)).resolves.toBe(true);
  });

  it('paginates until it finds the installation', async () => {
    network.use(
      http.get('https://api.github.com/user/installations', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        if (page === '2') {
          return HttpResponse.json({ total_count: 150, installations: [{ id: 4242 }] });
        }
        return HttpResponse.json({
          total_count: 150,
          installations: Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })),
        });
      }),
    );
    await expect(hasInstallationAccess('token', 4242)).resolves.toBe(true);
  });

  it('returns false when the installation is not visible', async () => {
    network.use(
      http.get('https://api.github.com/user/installations', () =>
        HttpResponse.json({ total_count: 1, installations: [{ id: 9999 }] }),
      ),
    );
    await expect(hasInstallationAccess('token', 4242)).resolves.toBe(false);
  });
});
