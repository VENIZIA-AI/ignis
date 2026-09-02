import type { TConstValue } from '@venizia/ignis-helpers';

/** Mirrors the kernel's `ArtifactTypes` values; boot must not depend on kernel (`{boot, kernel} -> core` in the build chain). */
export class ArtifactTypes {
  static readonly COMPONENT = 'component';
  static readonly CONTROLLER = 'controller';
  static readonly SERVICE = 'service';
  static readonly REPOSITORY = 'repository';
  static readonly DATASOURCE = 'datasource';
  static readonly MODEL = 'model';

  static readonly SCHEME_SET = new Set<string>([
    this.COMPONENT,
    this.CONTROLLER,
    this.SERVICE,
    this.REPOSITORY,
    this.DATASOURCE,
    this.MODEL,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TArtifactType = TConstValue<typeof ArtifactTypes>;

/** Mirrors the kernel's `ArtifactIndexFields` - the keys of the object the emitter writes and `registerArtifacts` reads. */
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

export class ArtifactStereotypes {
  /** Decorator name as imported from `@venizia/ignis` or `@venizia/ignis-kernel` -> artifact type. */
  static readonly BY_DECORATOR: Readonly<Record<string, TArtifactType>> = {
    component: ArtifactTypes.COMPONENT,
    controller: ArtifactTypes.CONTROLLER,
    service: ArtifactTypes.SERVICE,
    repository: ArtifactTypes.REPOSITORY,
    datasource: ArtifactTypes.DATASOURCE,
    model: ArtifactTypes.MODEL,
  };

  static readonly ROOT_DECORATOR = 'injectable';

  static readonly SCHEME_SET = new Set<string>(Object.values(ArtifactStereotypes.BY_DECORATOR));

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }

  static readonly SOURCE_MODULES = /^@venizia\/ignis(-kernel)?$/;

  static readonly DEFAULT_IGNORE = [
    '**/__tests__/**',
    '**/*.test.ts',
    '**/*.spec.ts',
    '**/generated/**',
  ];

  /** The kernel's `registerArtifacts` order; `model` is never emitted. */
  static readonly EMIT_ORDER: ReadonlyArray<{ type: TArtifactType; field: TArtifactIndexField }> = [
    { type: ArtifactTypes.DATASOURCE, field: ArtifactIndexFields.DATA_SOURCES },
    { type: ArtifactTypes.COMPONENT, field: ArtifactIndexFields.COMPONENTS },
    { type: ArtifactTypes.REPOSITORY, field: ArtifactIndexFields.REPOSITORIES },
    { type: ArtifactTypes.SERVICE, field: ArtifactIndexFields.SERVICES },
    { type: ArtifactTypes.CONTROLLER, field: ArtifactIndexFields.CONTROLLERS },
  ];
}
