/** Container keys of the static asset component. */
export class StaticAssetComponentBindingKeys {
  /** The options an application registers through `configs.artifacts` land here, because an artifact index carries classes and no options. `application.component(StaticAssetComponent, { options })` passes them directly and wins over this key. */
  static readonly STATIC_ASSET_COMPONENT_OPTIONS = '@app/static-asset-component/options';

  /** The `AssetDirectUploadService` of one options entry, bound only for an entry that sets `controller.directUpload`. `name` is the entry's KEY in the options object, not the controller name. */
  static directService(opts: { name: string }): string {
    return `@app/static-asset-component/direct-service/${opts.name}`;
  }
}
