export * from './schema/index.js';
export {
  createDatabase,
  createManagedDatabase,
  pingDatabase,
  isPasswordAuthFailure,
} from './client.js';
export type { Database, DatabaseHandle, ManagedDatabaseOptions } from './client.js';
