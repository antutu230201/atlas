import { defineConfig } from 'drizzle-kit';
import { loadEnv } from './src/env';

const env = loadEnv();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: env.DATABASE_URL_ADMIN },
});
