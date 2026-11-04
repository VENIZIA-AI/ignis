/** Options of a search datasource: its `name` and the engine-specific `config` settings. */
export interface ISearchDataSourceOptions<Settings extends object = {}> {
  name: string;
  config: Settings;

  /**
   * Auto-provision discovered collections on configure().
   *
   * @default `true` when `APP_ENV_AUTO_PROVISION_COLLECTION` is 'true' or '1', else `false`
   */
  autoProvision?: boolean;
}
