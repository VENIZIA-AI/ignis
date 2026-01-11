import 'dotenv-flow/config';

import { applicationEnvironment, int, LoggerFactory } from '@venizia/ignis';
import { defineConfig } from 'drizzle-kit';

const migration = () => {
  const logger = LoggerFactory.getLogger([migration.name]);

  const envKeys = applicationEnvironment.keys();
  logger.for('migration').info(' envKeys: %s', envKeys, process.env);

  const databaseConfigs = {
    host: process.env.APP_ENV_POSTGRES_HOST ?? '0.0.0.0',
    port: int(process.env.APP_ENV_POSTGRES_PORT ?? '5432'),
    database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'postgres',
    user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
    password: process.env.APP_ENV_POSTGRES_PASSWORD ?? 'password',
    ssl: false,
  };

  logger.for('migration').info(' databaseConfigs: %j', databaseConfigs);

  return defineConfig({
    dialect: 'postgresql',
    out: './migration',
    schema: './src/models/entities',
    dbCredentials: databaseConfigs,
  });
};

export default migration();