export class StaticAssetComponentBindingKeys {
  /** The options an application registers through `configs.artifacts` land here, because an artifact index carries classes and no options. `application.component(StaticAssetComponent, { options })` passes them directly and wins over this key. */
  static readonly STATIC_ASSET_COMPONENT_OPTIONS = '@app/static-asset-component/options';
}
