export const load = async () => {
  const { PostgresJsDriver } =
    await import('../../../../connectors/postgres/drivers/postgres-js.js');
  return PostgresJsDriver.name;
};
