import {
  organizationTable,
  policyDefinitionTable,
  Role,
  roleTable,
  TChangePasswordRequestSchema,
  TChangePasswordResponseSchema,
  TSignInRequestSchema,
  TSignInResponseSchema,
  TSignUpRequestSchema,
  TSignUpResponseSchema,
  userTable,
} from '@/models';
import { Organization } from '@/models';
import { UserRepository } from '@/repositories';
import {
  Authentication,
  BaseService,
  IAuthService,
  inject,
  JWKSIssuerTokenService,
  service,
  TContext,
  UserStatuses,
  UserTypes,
} from '@venizia/ignis';
import { getError, HTTP } from '@venizia/ignis-helpers';
import { compare, genSalt, hash } from 'bcrypt';
import { and, eq } from 'drizzle-orm';
import { Env } from 'hono';

/** The principal type a user's policy rows carry; the Casbin adapter in application.ts maps it. */
const USER_PRINCIPAL = 'user';

/** Bypasses the change-password ownership check; matches the alwaysAllowRoles bypass in platform.component.ts. */
const ALWAYS_ALLOWED_ROLE = '999_super-admin';

/**
 * Sign-up, sign-in and change-password for the framework's `/auth` routes. The signed token carries
 * the user's roles and organization: the organization is the Casbin domain every check runs in.
 */
@service()
export class AuthenticationService
  extends BaseService
  implements
    IAuthService<
      Env,
      TSignInRequestSchema,
      TSignInResponseSchema,
      TSignUpRequestSchema,
      TSignUpResponseSchema,
      TChangePasswordRequestSchema,
      TChangePasswordResponseSchema
    >
{
  constructor(
    @inject({ target: UserRepository }) private readonly userRepository: UserRepository,
    @inject({ target: JWKSIssuerTokenService })
    private readonly tokenService: JWKSIssuerTokenService,
  ) {
    super({ scope: AuthenticationService.name });
  }

  async signUp(
    _context: TContext<Env>,
    opts: TSignUpRequestSchema,
  ): Promise<TSignUpResponseSchema> {
    const existing = await this.userRepository.findByUsername({ username: opts.username });
    if (existing) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Conflict,
        message: 'Username already exists',
      });
    }

    const password = await hash(opts.credential, await genSalt());
    await this.userRepository.create({
      data: {
        username: opts.username,
        email: `${opts.username}@example.com`,
        password,
        status: UserStatuses.ACTIVATED,
        type: UserTypes.SYSTEM,
        realm: 'default',
      },
    });

    return { message: 'User registered successfully' };
  }

  async signIn(
    _context: TContext<Env>,
    opts: TSignInRequestSchema,
  ): Promise<TSignInResponseSchema> {
    // `password` is a hidden property, so the repository never returns it: read it with the connector.
    const [user] = await this.userRepository.connector
      .select({
        id: userTable.id,
        email: userTable.email,
        username: userTable.username,
        password: userTable.password,
      })
      .from(userTable)
      .where(eq(userTable.username, opts.identifier.value))
      .limit(1);

    const isValid = user?.password ? await compare(opts.credential.value, user.password) : false;
    if (!user || !isValid) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Invalid credentials',
      });
    }

    const roles = await this.getUserRoles({ userId: user.id });
    const organizationId = await this.getUserOrganizationId({ userId: user.id });

    const token = await this.tokenService.generate({
      payload: {
        userId: user.id,
        email: user.email,
        username: user.username,
        principalType: USER_PRINCIPAL,
        roles,
        organizationId,
      },
    });

    return {
      userId: user.id,
      roles: roles.map(role => role.identifier),
      token: { value: token, type: 'Bearer' },
    };
  }

  async changePassword(
    context: TContext<Env>,
    opts: TChangePasswordRequestSchema,
  ): Promise<TChangePasswordResponseSchema> {
    const currentUser = context.get(Authentication.CURRENT_USER);
    const isAlwaysAllowed = currentUser?.roles?.some(
      (role: { identifier: string }) => role.identifier === ALWAYS_ALLOWED_ROLE,
    );

    if (!isAlwaysAllowed && currentUser?.userId !== opts.userId) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Forbidden,
        message: 'You are not authorized to change this password',
      });
    }

    const [user] = await this.userRepository.connector
      .select({ password: userTable.password })
      .from(userTable)
      .where(eq(userTable.id, opts.userId))
      .limit(1);

    if (!user?.password) {
      throw getError({ statusCode: HTTP.ResultCodes.RS_4.NotFound, message: 'User not found' });
    }

    if (!(await compare(opts.oldCredential, user.password))) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Invalid old password',
      });
    }

    const password = await hash(opts.newCredential, await genSalt());
    await this.userRepository.updateById({ id: opts.userId, data: { password } });

    return { message: 'Password changed successfully' };
  }

  /** The roles assigned to the user: PolicyDefinition rows from the user to a Role. */
  private getUserRoles(opts: { userId: string }) {
    return this.userRepository.connector
      .select({ id: roleTable.id, identifier: roleTable.identifier, priority: roleTable.priority })
      .from(policyDefinitionTable)
      .innerJoin(roleTable, eq(policyDefinitionTable.targetId, roleTable.id))
      .where(
        and(
          eq(policyDefinitionTable.subjectType, USER_PRINCIPAL),
          eq(policyDefinitionTable.subjectId, opts.userId),
          eq(policyDefinitionTable.targetType, Role.name),
        ),
      );
  }

  /** The organization of the user's first role assignment, or null when the user has none. */
  private async getUserOrganizationId(opts: { userId: string }): Promise<string | null> {
    const [organization] = await this.userRepository.connector
      .select({ id: organizationTable.id })
      .from(policyDefinitionTable)
      .innerJoin(organizationTable, eq(policyDefinitionTable.domainId, organizationTable.id))
      .where(
        and(
          eq(policyDefinitionTable.subjectType, USER_PRINCIPAL),
          eq(policyDefinitionTable.subjectId, opts.userId),
          eq(policyDefinitionTable.targetType, Role.name),
          eq(policyDefinitionTable.domainType, Organization.name),
        ),
      )
      .limit(1);

    return organization?.id ?? null;
  }
}
