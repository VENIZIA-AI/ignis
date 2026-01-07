import {
  TChangePasswordRequestSchema,
  TChangePasswordResponseSchema,
  TGetUserInformationRequestSchema,
  TGetUserInformationResponseSchema,
  TSignInRequestSchema,
  TSignInResponseSchema,
  TSignUpRequestSchema,
  TSignUpResponseSchema,
} from '@/models';
import { UserRepository } from '@/repositories';
import {
  BaseService,
  getError,
  HTTP,
  IAuthService,
  inject,
  JWTTokenService,
  TContext,
  UserStatuses,
  UserTypes,
} from '@venizia/ignis';
import { hash, compare, genSalt } from 'bcrypt';
import { User } from '@/models';
import { eq } from 'drizzle-orm';

export class AuthenticationService
  extends BaseService
  implements
    IAuthService<
      TSignInRequestSchema,
      TSignInResponseSchema,
      TSignUpRequestSchema,
      TSignUpResponseSchema,
      TChangePasswordRequestSchema,
      TChangePasswordResponseSchema,
      TGetUserInformationRequestSchema,
      TGetUserInformationResponseSchema
    >
{
  constructor(
    @inject({ key: 'repositories.UserRepository' })
    private userRepository: UserRepository,
    @inject({ key: 'services.JWTTokenService' })
    private jwtTokenService: JWTTokenService,
  ) {
    super({ scope: AuthenticationService.name });
  }

  async signUp(_context: TContext, opts: TSignUpRequestSchema): Promise<TSignUpResponseSchema> {
    this.logger.info('SignUp called | username: %s', opts.username);

    // Check if user already exists
    const existingUser = await this.userRepository.findByUsername(opts.username);
    if (existingUser) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Conflict,
        message: 'Username already exists',
      });
    }

    // Hash password
    const salt = await genSalt();
    const hashedPassword = await hash(opts.credential, salt);

    // Create user - createdBy will be automatically set from context (if authenticated)
    const { data: newUser } = await this.userRepository.create({
      data: {
        username: opts.username,
        email: `${opts.username}@example.com`, // In real app, get from request
        password: hashedPassword,
        status: UserStatuses.ACTIVATED,
        type: UserTypes.SYSTEM,
        realm: 'default',
      },
    });

    this.logger.info('User created successfully | userId: %s', newUser?.id);

    return { message: 'User registered successfully' };
  }

  async signIn(_context: TContext, opts: TSignInRequestSchema): Promise<TSignInResponseSchema> {
    this.logger.info('SignIn called | identifier: %j', opts.identifier);

    // Find user by username/email
    const user = await this.userRepository.findByUsername(opts.identifier.value);

    if (!user) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Invalid credentials',
      });
    }

    // Password is a hidden property, must use connector directly to retrieve it
    const usersWithPassword = await this.userRepository
      .getConnector()
      .select({
        id: User.schema.id,
        password: User.schema.password,
        email: User.schema.email,
        username: User.schema.username,
      })
      .from(User.schema)
      .where(eq(User.schema.username, opts.identifier.value));

    const userWithPassword = usersWithPassword[0];

    if (!userWithPassword || !userWithPassword.password) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Invalid credentials',
      });
    }

    const isPasswordValid = await compare(opts.credential.value, userWithPassword.password);

    if (!isPasswordValid) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Invalid credentials',
      });
    }

    // Generate JWT token
    const token = await this.jwtTokenService.generate({
      payload: {
        userId: user.id,
        email: user.email,
        username: user.username,
        roles: [], // Add roles if available
      },
    });

    this.logger.info('User signed in successfully | userId: %s', user.id);

    return {
      userId: user.id as any, // Type assertion needed as schema expects number
      roles: [],
      token: {
        value: token,
        type: 'Bearer',
      },
    };
  }

  async changePassword(
    _context: TContext,
    opts: TChangePasswordRequestSchema,
  ): Promise<TChangePasswordResponseSchema> {
    this.logger.info('ChangePassword called | userId: %s', opts.userId);

    // Password is a hidden property, must use connector directly to retrieve it
    const usersWithPassword = await this.userRepository
      .getConnector()
      .select()
      .from(User.schema)
      .where(eq(User.schema.id, opts.userId));

    const userWithPassword = usersWithPassword[0];

    if (!userWithPassword || !userWithPassword.password) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.NotFound,
        message: 'User not found',
      });
    }

    // Verify old password
    const isOldPasswordValid = await compare(opts.oldCredential, userWithPassword.password);

    if (!isOldPasswordValid) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Unauthorized,
        message: 'Invalid old password',
      });
    }

    // Hash new password
    const salt = await genSalt();
    const hashedPassword = await hash(opts.newCredential, salt);

    // Update password - modifiedBy will be automatically set from context
    await this.userRepository.updateById({
      id: opts.userId,
      data: {
        password: hashedPassword,
      },
    });

    this.logger.info('Password changed successfully | userId: %s', opts.userId);

    return { message: 'Password changed successfully' };
  }

  async getUserInformation(
    _context: TContext,
    _opts: TGetUserInformationRequestSchema,
  ): Promise<TGetUserInformationResponseSchema> {
    this.logger.info('GetUserInformation called');
    // Implement based on your needs
    return {};
  }
}
