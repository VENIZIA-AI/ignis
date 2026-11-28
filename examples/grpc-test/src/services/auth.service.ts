import { UserRepository } from '@/repositories/user.repository';
import { BaseService, inject, JWSTokenService, service } from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';

/** Checks a password and issues the JWT every protected RPC asks for. */
@service()
export class AuthService extends BaseService {
  /** The hash of a password nobody has, built on first use. */
  private static absentHash?: Promise<string>;

  private static readAbsentHash() {
    AuthService.absentHash ??= Bun.password.hash(crypto.randomUUID());

    return AuthService.absentHash;
  }

  constructor(
    @inject({ target: UserRepository }) private readonly userRepository: UserRepository,
    @inject({ target: JWSTokenService }) private readonly tokenService: JWSTokenService,
  ) {
    super({ scope: AuthService.name });
  }

  async signIn(opts: { username: string; password: string }): Promise<{ token: string }> {
    const user = await this.userRepository.findOne({
      filter: { where: { username: opts.username } },
    });

    // An unknown user costs the same hash check as a wrong password, so timing does not name the users.
    const absentHash = await AuthService.readAbsentHash();
    const isValid = await Bun.password.verify(opts.password, user?.passwordHash ?? absentHash);

    if (!user || !isValid) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Invalid username or password',
      });
    }

    const token = await this.tokenService.generate({
      payload: {
        userId: user.id,
        // An enforcer refuses a user with no `principalType`.
        principalType: 'user',
        roles: [{ id: user.role, identifier: user.role, priority: 0 }],
      },
    });

    return { token };
  }
}
