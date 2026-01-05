/**
 * Standard REST API path constants for CRUD controllers.
 *
 * These paths are used by {@link ControllerFactory} to define consistent
 * endpoint patterns across all generated controllers.
 *
 * @example
 * ```typescript
 * // Combined with controller basePath:
 * // basePath: '/users'
 * // GET /users        → find all (RestPaths.ROOT)
 * // GET /users/count  → count (RestPaths.COUNT)
 * // GET /users/find-one → find one (RestPaths.FIND_ONE)
 * // GET /users/:id    → find by id
 * ```
 */
export class RestPaths {
  /** Root path for collection operations (find, create, updateBy, deleteBy) */
  static readonly ROOT = '/';

  /** Path for count operations */
  static readonly COUNT = '/count';

  /** Path for find-one operations (returns single record matching filter) */
  static readonly FIND_ONE = '/find-one';
}
