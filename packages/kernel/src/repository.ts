/**
 * The persistence contract, and nothing about how a row is served or validated.
 *
 * A repository talks to a datasource. `AbstractDataSource` is engine-neutral - its only required
 * member is `configure()` - so "an HTTP request to another server" is a datasource in the same sense
 * Drizzle-over-Postgres is one: same role, different transport. This entry exists so a consumer can
 * implement that without taking the OpenAPI layer, which `base/repositories` reaches through
 * `query-schemas` and `result-schemas`.
 *
 * Both halves already speak `@venizia/ignis-filter`, so a consumer on another transport shares the
 * query vocabulary rather than translating into one.
 *
 * Weight is a contract, checked by `src/__tests__/bundle/browser-weight.test.ts`.
 */

export { AbstractRepository } from '@/base/repositories/core/abstract';
export { AbstractDataSource } from '@/base/datasources/abstract';

export type {
  ICreatableRepository,
  ICrudRepository,
  IDeletableRepository,
  IPersistableRepository,
  IReadableRepository,
  IRepository,
  IUpdatableRepository,
} from '@/base/repositories/common/types/contracts';

export { buildDataRange } from '@/base/repositories/common/types/results';

// What a repository on any transport raises and bounds itself by - the constants, the error codes,
// and the helper an engine that lacks an operation throws through.
export {
  DEFAULT_LIMIT,
  DEFAULT_MAX_LIMIT,
  RepositoryOperationScopes,
  RepositoryTypes,
} from '@/base/repositories/common/constants';
export type { TRepositoryType } from '@/base/repositories/common/constants';
export { CoreErrorCodes, SearchErrorCodes } from '@/common/error-codes';
export { throwNotSupported } from '@/utilities/error.utility';
export type { TCount, TDataRange, TDataWithRange } from '@/base/repositories/common/types/results';

export type { IDataSource } from '@/base/datasources/common/types';

// `IRepository` names an entity, so a consumer implementing the contract needs the base to extend.
// Engine-neutral like the datasource: a name, `getSchema({ type })`, and an id type.
export { AbstractEntity } from '@/base/models/base';
export { SchemaTypes } from '@/base/models/common/constants';
export type { TIdSchemaType, TSchemaType } from '@/base/models/common';

// The query vocabulary both transports share.
export type { TFilter, TInclusion, TWhere } from '@venizia/ignis-filter';
