import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config({
  path: '../../.env',
});

const pgUrl =
  process.env.POSTGRES_URL ??
  `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST ?? '127.0.0.1'}:${process.env.POSTGRES_PORT ?? process.env.DATABASE_PORT ?? '5432'}/${process.env.POSTGRES_DB}`;

export default defineConfig({
  out: './drizzle',
  schema: './db/postgres/schema',
  dialect: 'postgresql',
  verbose: true,
  strict: true,
  dbCredentials: {
    url: pgUrl,
  },
  // Keep extension-owned objects and db:init-managed table out of drizzle diffs.
  tablesFilter: ['!spatial_ref_sys', '!geography_columns', '!geometry_columns', '!item_search'],
});
