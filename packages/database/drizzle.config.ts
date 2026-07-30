import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://readycircle:readycircle_dev_password@localhost:5432/readycircle',
  },
});
