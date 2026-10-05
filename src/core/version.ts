import pkg from '../../package.json';

/**
 * Single source of truth for the application version, sourced directly from `package.json`.
 */
export const APP_VERSION: string = pkg.version;
