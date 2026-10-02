import { fetchUserInstallations } from './github';

const MAX_PAGES = 10;
const PAGE_SIZE = 100;

export async function hasInstallationAccess(
  token: string,
  installationId: number,
): Promise<boolean> {
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { totalCount, installationIds } = await fetchUserInstallations(token, page);
    if (installationIds.includes(installationId)) {
      return true;
    }
    if (installationIds.length === 0 || page * PAGE_SIZE >= totalCount) {
      return false;
    }
  }
  return false;
}
