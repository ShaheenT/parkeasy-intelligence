import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  DATABASE_SSL: z.string().default('false'),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  PEI_API_KEYS: z.string().min(20),
  CORS_ORIGINS: z.string().default(''),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  INVENTORY_FRESHNESS_MINUTES: z.coerce.number().int().positive().max(1440).default(15)
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

export const config = {
  ...parsed.data,
  apiKeys: parsed.data.PEI_API_KEYS.split(',').map(v => v.trim()).filter(Boolean),
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map(v => v.trim()).filter(Boolean),
  databaseSsl: parsed.data.DATABASE_SSL === 'true'
};
