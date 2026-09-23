import { TChangePasswordResponse, TSignInResponse, TSignUpResponse } from '@/models/auth.schema';
import { UserRepository } from '@/repositories/user.repository';
import {
  Authentication,
  BaseService,
  IAuthService,
  inject,
  JWSTokenService,
  service,
  TChangePasswordRequest,
  TContext,
  TSignInRequest,
  TSignUpRequest,
} from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';
import { Env } from 'hono';

/** What the auth controller calls. Passwords are hashed with `Bun.password` (argon2id). */
@service()
export class AuthenticationService
  extends BaseService
  implements
    IAuthService<
      Env,
      TSignInRequest,
      TSignInResponse,
      TSignUpRequest,
      TSignUpResponse,
      TChangePasswordRequest,
      TChangePasswordResponse
    >
{
  constructor(
    @inject({ target: UserRepository }) private readonly userRepository: UserRepository,
    @inject({ target: JWSTokenService }) private readonly tokenService: JWSTokenService,
  ) {
    super({ scope: AuthenticationService.name });
  }

  async signUp(_context: TContext<Env>, opts: TSignUpRequest): Promise<TSignUpResponse> {
    const existing = await this.userRepository.findOne({
      filter: { where: { username: opts.username } },
    });
    if (existing) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Conflict,
        message: 'Username already exists',
      });
    }

    // This check has a race; the unique constraint on `username` is the real guard against two
    // concurrent sign-ups.
    const { data: user } = await this.userRepository.create({
      data: { username: opts.username, password: await Bun.password.hash(opts.credential) },
    });
    return { id: user.id, username: user.username };
  }

  async signIn(_context: TContext<Env>, opts: TSignInRequest): Promise<TSignInResponse> {
    const user = await this.userRepository.findOne({
      filter: { where: { username: opts.identifier.value } },
    });
    if (!user || !(await Bun.password.verify(opts.credential.value, user.password))) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Invalid username or password',
      });
    }

    const token = await this.tokenService.generate({ payload: { userId: user.id, roles: [] } });
    return { token };
  }

  /** The route is JWT-protected; the user comes from the token, never from the body. */
  async changePassword(
    context: TContext<Env>,
    opts: TChangePasswordRequest,
  ): Promise<TChangePasswordResponse> {
    const { userId } = context.get(Authentication.CURRENT_USER);
    const user = await this.userRepository.findById({ id: String(userId) });

    if (!user || !(await Bun.password.verify(opts.oldCredential, user.password))) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Invalid old password',
      });
    }

    await this.userRepository.updateById({
      id: user.id,
      data: { password: await Bun.password.hash(opts.newCredential) },
    });
    return { id: user.id };
  }
}
