import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { User } from '@/models/entities';
import { inject, ReadableRepository, repository } from '@venizia/ignis';

/**
 * UserRepository with manual @inject (read-only).
 *
 * Demonstrates using both:
 * - @repository decorator: registers model-datasource binding for schema auto-discovery
 * - @inject decorator: explicit constructor dependency injection
 *
 * This pattern is useful when you need more control over the constructor.
 */
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends ReadableRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' })
    dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }

  // Add custom methods as needed
  async findByRealm(realm: string) {
    return this.findOne({ filter: { where: { realm } } });
  }
}
