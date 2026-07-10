export interface ISearchDataSourceOptions<Settings extends object = {}> {
  name: string;
  config: Settings;

  /** Auto-provision discovered collections on configure(). Defaults to the
   * `APP_ENV_AUTO_PROVISION_COLLECTION` env flag, which is off unless set to 'true' or '1'. */
  autoProvision?: boolean;
}
