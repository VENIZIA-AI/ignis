import type { TConstValue } from '@venizia/ignis-helpers';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** Mirrors the kernel's `ArtifactTypes` values; boot must not depend on kernel (`{boot, kernel} -> core` in the build chain). */
export class ArtifactTypes extends ConstClass {
  static readonly CONFIGURATION = 'configuration';
  static readonly COMPONENT = 'component';
  static readonly CONTROLLER = 'controller';
  static readonly SERVICE = 'service';
  static readonly REPOSITORY = 'repository';
  static readonly DATASOURCE = 'datasource';
  static readonly MODEL = 'model';
}

/** One of the `ArtifactTypes` values. */
export type TArtifactType = TConstValue<typeof ArtifactTypes>;

/** Mirrors the kernel's `ArtifactIndexFields` - the keys of the object the emitter writes and `registerArtifacts` reads. */
export class ArtifactIndexFields extends ConstClass {
  static readonly CONFIGURATIONS = 'configurations';
  static readonly DATA_SOURCES = 'dataSources';
  static readonly COMPONENTS = 'components';
  static readonly REPOSITORIES = 'repositories';
  static readonly SERVICES = 'services';
  static readonly CONTROLLERS = 'controllers';
}

/** One of the `ArtifactIndexFields` values. */
export type TArtifactIndexField = TConstValue<typeof ArtifactIndexFields>;

/** How the scanner recognises a decorated class: the source glob, decorator-to-type map, default ignore patterns and the emit order. */
export class ArtifactStereotypes {
  /** The source files the scanner reads: TypeScript, with or without JSX. */
  static readonly SOURCE_GLOB = '**/*.{ts,tsx}';
  /** The extension of a source file - stripped for an import specifier, replaced by `.js` for its compiled copy. */
  static readonly SOURCE_EXTENSION = /\.tsx?$/;
  /** Decorator name as imported from `@venizia/ignis` or `@venizia/ignis-kernel` -> artifact type. */
  static readonly BY_DECORATOR: Readonly<Record<string, TArtifactType>> = {
    configuration: ArtifactTypes.CONFIGURATION,
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

  static readonly SOURCE_MODULES = /^@venizia\/ignis(?:-kernel)?(?:\/.+)?$/;

  /** The index field that carries the classes of the application's own types (`ArtifactTypes.define`), by type name; mirrors the kernel's `IArtifactIndex.custom`. */
  static readonly CUSTOM_FIELD = 'custom';

  /** Whether `type` is one of the built-in artifact types, `model` included. */
  static isBuiltIn(opts: { type: string }): boolean {
    return ArtifactTypes.isValid(opts.type);
  }

  /** The classes of the custom types among `artifacts`, grouped by type name; types and classes in name order, so the output is stable. */
  static groupCustom<Artifact extends { type: string; className: string }>(opts: {
    artifacts: ReadonlyArray<Artifact>;
  }): Array<{ type: string; artifacts: Artifact[] }> {
    const byType = new Map<string, Artifact[]>();

    for (const artifact of opts.artifacts) {
      if (ArtifactStereotypes.isBuiltIn({ type: artifact.type })) {
        continue;
      }

      byType.set(artifact.type, [...(byType.get(artifact.type) ?? []), artifact]);
    }

    return [...byType.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([type, artifacts]) => ({
        type,
        artifacts: artifacts.sort((left, right) => left.className.localeCompare(right.className)),
      }));
  }

  static readonly DEFAULT_IGNORE = [
    '**/__tests__/**',
    '**/*.test.{ts,tsx}',
    '**/*.spec.{ts,tsx}',
    '**/generated/**',
  ];

  /**
   * The kernel's `registerArtifacts` order; `model` is never emitted. Configurations come first:
   * `registerConfigurations` runs before the datasource and component sweeps, so a `@configuration`
   * can shape what they read. The kernel sorts them among themselves by their `after` declarations
   * at boot, so the order within the field does not matter here.
   */
  static readonly EMIT_ORDER: ReadonlyArray<{ type: TArtifactType; field: TArtifactIndexField }> = [
    { type: ArtifactTypes.CONFIGURATION, field: ArtifactIndexFields.CONFIGURATIONS },
    { type: ArtifactTypes.DATASOURCE, field: ArtifactIndexFields.DATA_SOURCES },
    { type: ArtifactTypes.COMPONENT, field: ArtifactIndexFields.COMPONENTS },
    { type: ArtifactTypes.REPOSITORY, field: ArtifactIndexFields.REPOSITORIES },
    { type: ArtifactTypes.SERVICE, field: ArtifactIndexFields.SERVICES },
    { type: ArtifactTypes.CONTROLLER, field: ArtifactIndexFields.CONTROLLERS },
  ];
}

/** Why a decorated class was left out of the index - reported, never silent. */
export class ScanSkipReasons extends ConstClass {
  static readonly ABSTRACT = 'abstract';
  static readonly NOT_EXPORTED = 'not-exported';
  static readonly IGNORED = 'ignored';
  /** The decorator comes from an `ArtifactTypes.define` the scanner cannot read (a type that is not a literal, a built package, a barrel). */
  static readonly UNREADABLE_TYPE = 'unreadable-type';
}

/** One of the `ScanSkipReasons` values. */
export type TScanSkipReason = TConstValue<typeof ScanSkipReasons>;
