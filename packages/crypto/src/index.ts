// Envelope encryption, signing, receipts (technical-approach §3.9). node:crypto only.
// M1.2: the master key loader and envelope encryption (WP 1-15a).
export {
  EncryptionKeyMismatchError,
  open,
  type SealedSecret,
  SecretIntegrityError,
  seal,
} from './envelope.ts';
export {
  type KeyFileAccess,
  loadMasterKeyFile,
  MASTER_KEY_BYTES,
  MasterKey,
  MasterKeyError,
  type MasterKeyProblem,
} from './master-key.ts';
