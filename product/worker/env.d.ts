interface Env {
  ENCRYPTION_KEY?: string;
  ENCRYPTION_KEY_VERSION?: string;
  ENCRYPTION_KEY_PREVIOUS?: string;
  ENCRYPTION_KEY_PREVIOUS_VERSION?: string;
  SETUP_CODE?: string;
}

declare namespace Cloudflare {
  interface Env {
    ENCRYPTION_KEY?: string;
    ENCRYPTION_KEY_VERSION?: string;
    ENCRYPTION_KEY_PREVIOUS?: string;
    ENCRYPTION_KEY_PREVIOUS_VERSION?: string;
    SETUP_CODE?: string;
  }
}
