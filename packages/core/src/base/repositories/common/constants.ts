import { TConstValue } from '@venizia/ignis-helpers';

/**
 * Default pagination limit for repository queries.
 * Used when no limit is explicitly specified in filter options.
 */
export const DEFAULT_LIMIT = 10;

/**
 * Defines the operation scope for repository instances.
 * Controls whether a repository can perform read-only or read-write operations.
 *
 * @example
 * ```typescript
 * // Check if a scope is valid
 * RepositoryOperationScopes.isValid('READ_ONLY'); // true
 *
 * // Use in repository configuration
 * const scope = RepositoryOperationScopes.READ_WRITE;
 * ```
 */
export class RepositoryOperationScopes {
  /** Repository can only perform read operations (find, count, existsWith). */
  static readonly READ_ONLY = 'READ_ONLY';

  /** Repository can only perform write operations (create, update, delete). */
  static readonly WRITE_ONLY = 'WRITE_ONLY';

  /** Repository can perform both read and write operations. */
  static readonly READ_WRITE = 'READ_WRITE';

  /** Set of all valid operation scopes for validation. */
  static readonly SCHEME_SET = new Set([this.READ_ONLY, this.WRITE_ONLY, this.READ_WRITE]);

  /**
   * Validates if a given string is a valid operation scope.
   *
   * @param orgType - The scope string to validate
   * @returns True if the scope is valid, false otherwise
   */
  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

/**
 * Type representing valid repository operation scope values.
 * Derived from {@link RepositoryOperationScopes} static properties.
 */
export type TRepositoryOperationScope = TConstValue<typeof RepositoryOperationScopes>;

/**
 * Defines the type of relation between entities in the ORM.
 * Used for configuring entity relationships (one-to-one, one-to-many, many-to-one).
 *
 * @example
 * ```typescript
 * // Define a one-to-many relation
 * const relation: TRelationConfig = {
 *   name: 'posts',
 *   type: RelationTypes.MANY,
 *   schema: PostSchema,
 *   metadata: { fields: [Post.schema.authorId], references: [User.schema.id] }
 * };
 * ```
 */
export class RelationTypes {
  /** Represents a one-to-one or many-to-one relation. */
  static readonly ONE = 'one';

  /** Represents a one-to-many relation. */
  static readonly MANY = 'many';

  /** Set of all valid relation types for validation. */
  static readonly SCHEME_SET = new Set([this.ONE, this.MANY]);

  /**
   * Validates if a given string is a valid relation type.
   *
   * @param orgType - The relation type string to validate
   * @returns True if the relation type is valid, false otherwise
   */
  static isValid(orgType: string): boolean {
    return this.SCHEME_SET.has(orgType);
  }
}

/**
 * Type representing valid relation type values.
 * Derived from {@link RelationTypes} static properties.
 */
export type TRelationType = TConstValue<typeof RelationTypes>;
