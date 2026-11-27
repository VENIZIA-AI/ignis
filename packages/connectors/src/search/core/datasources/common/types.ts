/** Options of a search datasource: its `name` and the engine-specific `config` settings. */
export interface ISearchDataSourceOptions<Settings extends object = {}> {
  name: string;
  config: Settings;

  /**
   * Auto-provision discovered collections on configure().
   *
   * @default `APP_ENV_AUTO_PROVISION_COLLECTION` read by `ParseUtility.toBoolean`: `false` when unset
   */
  autoProvision?: boolean;
}
