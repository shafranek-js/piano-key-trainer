import pkg from '../../package.json';

/**
 * Single source of truth for the application version, sourced directly from `package.json`.
 */
export const APP_VERSION: string = pkg.version;

/**
 * Canonical JSON backup format version. Owned here so diagnostics and storage can
 * reference it without a storage→core layering inversion.
 */
export const BACKUP_SCHEMA_VERSION = 1;

/**
 * Canonical IndexedDB schema version (Dexie `verno`). Storage evolves with the app;
 * diagnostics must read this instead of hard-coding a number.
 */
export const DB_SCHEMA_VERSION = 4;
