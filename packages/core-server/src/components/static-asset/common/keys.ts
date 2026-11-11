/** Container keys of the static asset component. */
export class StaticAssetBindingKeys {
  /** The options an application registers through `configs.artifacts` land here, because an artifact index carries classes and no options. `application.component(StaticAssetComponent, { options })` passes them directly and wins over this key. */
  static readonly STATIC_ASSET_OPTIONS = '@app/static-asset/options';

  /** The `StaticAssetUploadPolicyService` of one options entry, bound only for an entry that sets `controller.directUpload` with a `bucket`. `name` is the entry's KEY in the options object, not the controller name. */
  static policyService(opts: { name: string }): string {
    return `@app/static-asset/policy-service/${opts.name}`;
  }

  /** The `StaticAssetUploadCommitService` of one options entry, bound with its policy service. */
  static commitService(opts: { name: string }): string {
    return `@app/static-asset/commit-service/${opts.name}`;
  }
}
