import type { TArtifactType } from './types';

export class ArtifactStereotypes {
  /** Decorator name as imported from `@venizia/ignis` or `@venizia/ignis-kernel` -> artifact type. */
  static readonly BY_DECORATOR: Readonly<Record<string, TArtifactType>> = {
    component: 'component',
    controller: 'controller',
    service: 'service',
    repository: 'repository',
    datasource: 'datasource',
    model: 'model',
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
  static readonly EMIT_ORDER: ReadonlyArray<{ type: TArtifactType; field: string }> = [
    { type: 'datasource', field: 'dataSources' },
    { type: 'component', field: 'components' },
    { type: 'repository', field: 'repositories' },
    { type: 'service', field: 'services' },
    { type: 'controller', field: 'controllers' },
  ];
}
