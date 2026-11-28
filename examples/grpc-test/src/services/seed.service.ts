import { EnvKeys } from '@/common/env-keys';
import { Roles } from '@/common/roles';
import { NoteRepository } from '@/repositories/note.repository';
import { UserRepository } from '@/repositories/user.repository';
import { BaseService, inject, service } from '@venizia/ignis';
import { AppEnvs } from '@venizia/ignis-helpers';

const DEMO_USERS = [
  { username: 'alice', role: Roles.EDITOR },
  { username: 'bob', role: Roles.VIEWER },
];

/**
 * The demo data: `alice` (editor) and `bob` (viewer), who owns one note. Run it in a system execution frame: the note
 * belongs to a user nobody is signed in as. Not for production.
 */
@service()
export class SeedService extends BaseService {
  constructor(
    @inject({ target: UserRepository }) private readonly userRepository: UserRepository,
    @inject({ target: NoteRepository }) private readonly noteRepository: NoteRepository,
  ) {
    super({ scope: SeedService.name });
  }

  /** Does nothing when the users exist, as with a data directory that is kept. */
  async seed() {
    const { count } = await this.userRepository.count({ where: {} });

    if (count > 0) {
      return;
    }

    const passwordHash = await Bun.password.hash(
      AppEnvs.getRequired(EnvKeys.APP_ENV_DEMO_PASSWORD),
    );
    const { data } = await this.userRepository.createAll({
      data: DEMO_USERS.map((user) => ({ ...user, passwordHash })),
    });

    for (const user of data.filter(({ role }) => role === Roles.VIEWER)) {
      await this.noteRepository.create({
        data: { ownerId: user.id, title: 'Welcome', body: 'This note belongs to bob.' },
      });
    }
  }
}
