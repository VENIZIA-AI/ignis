import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { User } from '@/models/entities';
import { BindingKeys, BindingNamespaces, inject, repository } from '@venizia/ignis';
import { PersistableRepository } from '@venizia/ignis/postgres';

/**
 * UserRepository with manual @inject.
 *
 * Demonstrates using both:
 * - @repository decorator: registers model-datasource binding for schema auto-discovery
 * - @inject decorator: explicit constructor dependency injection
 *
 * This pattern is useful when you need more control over the constructor.
 *
 * Note: User model has hiddenProperties configured for 'password' and 'secret'.
 * These fields will be excluded from all repository query results.
 */
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends PersistableRepository<typeof User.schema> {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.DATASOURCE,
        key: PostgresDataSource.name,
      }),
    })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }

  // Add custom methods as needed
  async findByRealm(realm: string) {
    return this.findOne({ filter: { where: { realm } } });
  }

  async findByEmail(email: string) {
    return this.findOne({ filter: { where: { email } } });
  }

  async findByUsername(username: string) {
    return this.findOne({ filter: { where: { username } } });
  }
}
