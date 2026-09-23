import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { User, userTable } from '@/models/entities';
import { repository } from '@venizia/ignis';
import { PersistableRepository } from '@venizia/ignis/postgres';

/** `password` and `secret` are hidden properties, so no read or write here returns them. */
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends PersistableRepository<typeof userTable> {
  findByUsername(opts: { username: string }) {
    return this.findOne({ filter: { where: { username: opts.username } } });
  }

  findByEmail(opts: { email: string }) {
    return this.findOne({ filter: { where: { email: opts.email } } });
  }
}
