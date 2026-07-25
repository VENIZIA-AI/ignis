export interface ISearchDataSourceOptions<Settings extends object = {}> {
  name: string;
  config: Settings;

  /** Auto-provision discovered collections on configure(); defaults to `APP_ENV_AUTO_PROVISION_COLLECTION`, off unless set to 'true' or '1'. */
  autoProvision?: boolean;
}
