export const load = async () => {
  const { PostgresJsDriver } = await import('../../../relational/postgres/drivers/postgres-js.js');
  return PostgresJsDriver.name;
};
