import type { TConstValue } from '@venizia/ignis-helpers/common';

/** The `IArtifactIndex` field names, in registration order. `@venizia/ignis-boot` mirrors these values in its own `ArtifactIndexFields` - boot cannot depend on kernel. */
export class ArtifactIndexFields {
  static readonly DATA_SOURCES = 'dataSources';
  static readonly COMPONENTS = 'components';
  static readonly REPOSITORIES = 'repositories';
  static readonly SERVICES = 'services';
  static readonly CONTROLLERS = 'controllers';

  static readonly SCHEME_SET = new Set<string>([
    this.DATA_SOURCES,
    this.COMPONENTS,
    this.REPOSITORIES,
    this.SERVICES,
    this.CONTROLLERS,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TArtifactIndexField = TConstValue<typeof ArtifactIndexFields>;
