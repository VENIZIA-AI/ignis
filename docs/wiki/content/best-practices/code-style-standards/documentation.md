# Documentation (JSDoc)

Use JSDoc comments for public APIs to improve IDE support and generate documentation.

## When to Use JSDoc

| Context | Required? | Reason |
|---------|-----------|--------|
| Public methods | Yes | Consumers need documentation |
| Exported functions | Yes | API contract documentation |
| Complex types | Yes | Clarify usage |
| Private methods | No | Internal, can change |
| Self-explanatory code | No | Avoid redundant docs |

## JSDoc Format

```typescript
/**
 * Brief description of what the function does.
 *
 * @param opts - Description of the options object
 * @param opts.filter - Query filter with where, limit, offset
 * @param opts.options - Additional options like transaction
 * @returns Promise resolving to the query result
 *
 * @example
 * const users = await userRepo.find({
 *   filter: { where: { status: 'ACTIVE' }, limit: 10 },
 * });
 *
 * @throws {ApplicationError} When validation fails
 * @see {@link UserService} for business logic
 */
async find(opts: TFindOptions): Promise<TFindResult<TUser>> {
  // implementation
}
```

## Common JSDoc Tags

| Tag | Usage |
|-----|-------|
| `@param` | Document function parameters |
| `@returns` | Document return value |
| `@throws` | Document thrown exceptions |
| `@example` | Provide usage examples |
| `@see` | Reference related items |
| `@deprecated` | Mark as deprecated with migration path |
| `@internal` | Mark as internal (not public API) |
| `@since` | Version when feature was added |
| `@default` | Default value for optional parameter |

## Examples

### Service Method

```typescript
/**
 * Creates a new user account with the given data.
 *
 * Validates that the email is unique, hashes the password,
 * and sends a welcome email upon successful creation.
 *
 * @param data - User creation data
 * @returns The created user without sensitive fields
 * @throws {ApplicationError} 409 if email already exists
 * @throws {ApplicationError} 422 if validation fails
 *
 * @example
 * const user = await userService.createUser({
 *   email: 'john@example.com',
 *   name: 'John Doe',
 *   password: 'SecurePass123!',
 * });
 */
async createUser(data: TCreateUserRequest): Promise<TUser> {
  // ...
}
```

### Repository Method

```typescript
/**
 * Finds entities matching the given filter.
 *
 * @param opts - Find options
 * @param opts.filter - Query filter
 * @param opts.filter.where - Conditions to match
 * @param opts.filter.limit - Maximum records to return (default: 100)
 * @param opts.filter.offset - Records to skip for pagination
 * @param opts.filter.order - Sort order (e.g., ['createdAt DESC'])
 * @param opts.filter.include - Relations to load
 * @returns Promise with data array and count
 *
 * @example
 * // Find active users, sorted by name
 * const result = await userRepo.find({
 *   filter: {
 *     where: { status: 'ACTIVE' },
 *     order: ['name ASC'],
 *     limit: 20,
 *   },
 * });
 */
async find(opts: TFindOpts<Schema>): Promise<TFindResult<TEntity>> {
  // ...
}
```

### Deprecation

```typescript
/**
 * @deprecated Use {@link findById} instead. Will be removed in v2.0.
 *
 * @example
 * // Before (deprecated)
 * const user = await repo.getById('123');
 *
 * // After (recommended)
 * const { data: user } = await repo.findById({ id: '123' });
 */
async getById(id: string): Promise<TUser | null> {
  return this.findById({ id }).then(r => r.data);
}
```

### Type Documentation

```typescript
/**
 * Options for configuring user audit columns.
 *
 * @property dataType - The database type for user IDs ('string' | 'number')
 * @property columnName - The column name in the database
 * @property allowAnonymous - Whether to allow null user IDs (default: true)
 *
 * @example
 * const opts: TUserAuditColumnOpts = {
 *   dataType: 'string',
 *   columnName: 'created_by',
 *   allowAnonymous: false,
 * };
 */
type TUserAuditColumnOpts = {
  dataType: 'string' | 'number';
  columnName: string;
  allowAnonymous?: boolean;
};
```

### Interface Documentation

```typescript
/**
 * Configuration for JWT authentication strategy.
 *
 * @interface IJWTStrategyOptions
 * @property secret - Secret key for signing tokens (required)
 * @property expiresIn - Token expiration time (default: '1h')
 * @property algorithm - Signing algorithm (default: 'HS256')
 * @property issuer - Token issuer claim
 * @property audience - Token audience claim
 */
interface IJWTStrategyOptions {
  secret: string;
  expiresIn?: string;
  algorithm?: 'HS256' | 'HS384' | 'HS512';
  issuer?: string;
  audience?: string;
}
```

### Class Documentation

```typescript
/**
 * Base repository providing CRUD operations for database entities.
 *
 * Extends this class to create entity-specific repositories with
 * type-safe operations and automatic schema binding.
 *
 * @template Schema - The Drizzle table schema type
 *
 * @example
 * @repository({ model: User, dataSource: PostgresDataSource })
 * export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
 *   // Custom methods here
 * }
 *
 * @see {@link BaseEntity} for model definition
 * @see {@link BaseDataSource} for database connection
 */
abstract class DefaultCRUDRepository<Schema extends TTableSchemaWithId> {
  // ...
}
```

## Best Practices

### Do

- Write descriptions in third person ("Creates...", "Returns...", "Validates...")
- Include `@example` for non-obvious usage
- Document all parameters with `@param`
- Use `@throws` for expected exceptions
- Link to related items with `@see` and `{@link}`

### Don't

- Don't document obvious things (`@param id - The ID` - unhelpful)
- Don't copy TypeScript types into JSDoc (they're already visible)
- Don't write multi-paragraph descriptions for simple functions
- Don't use JSDoc for private implementation details

## See Also

- [Type Safety](./type-safety) - TypeScript best practices
- [Function Patterns](./function-patterns) - Method organization
- [API Reference](../../references/) - Documentation examples
