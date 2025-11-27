import 'dotenv-flow/config';

import { applicationEnvironment, int, LoggerFactory } from '@vez/ignis';
import { defineConfig } from 'drizzle-kit';
// import { Application, beConfigs } from './application';

const migration = () => {
  const logger = LoggerFactory.getLogger([migration.name]);
  /* const migrationApplication = new Application({
    scope: 'MigrationApplication',
    config: beConfigs,
  }); */

  const envKeys = applicationEnvironment.keys();
  logger.info('[migration] envKeys: %s', envKeys, process.env);

  const databaseConfigs = {
    host: process.env.APP_ENV_POSTGRES_HOST,
    port: int(process.env.APP_ENV_POSTGRES_PORT),
    database: process.env.APP_ENV_POSTGRES_DATABASE,
    user: process.env.APP_ENV_POSTGRES_USERNAME,
    password: process.env.APP_ENV_POSTGRES_PASSWORD,
    ssl: false,
  };

  console.log(databaseConfigs);

  return defineConfig({
    dialect: 'postgresql',
    out: './migration',
    schema: './src/models/entities',
    dbCredentials: databaseConfigs,
  });
};

export default migration();
