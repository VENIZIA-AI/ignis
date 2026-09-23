// Smoke test: boots the real application against the docker compose Postgres and Redis, signs in,
// calls one CRUD route with each credential, and checks that Casbin answers 403 for a user without
// the grant. It skips when the services are not up: run `docker compose up -d` first.
import { z } from '@hono/zod-openapi';
import {
  AuthorizationActions,
  AuthorizationDecisions,
  AuthorizationPolicyVariants,
  BindingNamespaces,
} from '@venizia/ignis';
import { applicationEnvironment, getError } from '@venizia/ignis-helpers';
import { uuidV7 } from '@venizia/ignis-helpers/uuid';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { generateKeyPairSync } from 'node:crypto';
import { Pool } from 'pg';
import { Application, beConfigs } from '../application';
import { Organization, Permission, Role } from '../models/entities';
import {
  ConfigurationRepository,
  OrganizationRepository,
  PermissionRepository,
  PolicyDefinitionRepository,
  RoleRepository,
  UserRepository,
} from '../repositories';

const HOST = '127.0.0.1';
const POSTGRES_PORT = 15434;
const REDIS_PORT = 16382;

// The docker-compose.yml services. The key pair exists only for this run.
const keyPair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const TEST_ENV = {
  APP_ENV_RUN_REPOSITORY_TESTS: 'false',
  APP_ENV_POSTGRES_HOST: HOST,
  APP_ENV_POSTGRES_PORT: String(POSTGRES_PORT),
  APP_ENV_POSTGRES_USERNAME: 'postgres',
  APP_ENV_POSTGRES_PASSWORD: 'password',
  APP_ENV_POSTGRES_DATABASE: 'vert',
  APP_ENV_AUTHORZ_REDIS_HOST: HOST,
  APP_ENV_AUTHORZ_REDIS_PORT: String(REDIS_PORT),
  APP_ENV_AUTHORZ_REDIS_PASSWORD: '',
  APP_ENV_AUTHORZ_REDIS_DB: '8',
  APP_ENV_JWT_EXPIRES_IN: '3600',
  APP_ENV_JWKS_ALGORITHM: 'ES256',
  APP_ENV_JWKS_KID: 'vert-smoke',
  APP_ENV_JWKS_KEY_DRIVER: 'text',
  APP_ENV_JWKS_KEY_FORMAT: 'pem',
  APP_ENV_JWKS_PRIVATE_KEY: keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  APP_ENV_JWKS_PUBLIC_KEY: keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
};

const isListening = async (opts: { port: number }) => {
  try {
    const socket = await Bun.connect({
      hostname: HOST,
      port: opts.port,
      socket: { data: () => {} },
    });
    socket.end();
    return true;
  } catch {
    return false;
  }
};

const SignInResponse = z.object({ userId: z.string(), token: z.object({ value: z.string() }) });
const ConfigurationResponse = z.object({ data: z.object({ id: z.string(), code: z.string() }) });

// Bun awaits an async describe callback before it collects the tests, so the probe can gate skipIf.
describe('vert', async () => {
  const servicesUp =
    (await isListening({ port: POSTGRES_PORT })) && (await isListening({ port: REDIS_PORT }));

  describe.skipIf(!servicesUp)('against docker compose', () => {
    const suffix = uuidV7().slice(-12);
    const password = 'smoke-password';
    const reader = `reader_${suffix}`;
    const outsider = `outsider_${suffix}`;
    const configurationCode = `SMOKE_${suffix}`;

    let application: Application;
    let baseUrl = '';
    const tokens = new Map<string, string>();

    const repository = <T>(opts: { name: string }) =>
      application.get<T>({ key: { namespace: BindingNamespaces.REPOSITORY, key: opts.name } });

    const post = (opts: { path: string; body: object; headers?: Record<string, string> }) =>
      fetch(`${baseUrl}${opts.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...opts.headers },
        body: JSON.stringify(opts.body),
      });

    const bearer = (opts: { username: string }) => ({
      authorization: `Bearer ${tokens.get(opts.username)}`,
    });

    /** One organization, one role granted read:configuration in it, and the reader assigned to it. */
    const seedGrant = async (opts: { userId: string }) => {
      const permissions = repository<PermissionRepository>({ name: PermissionRepository.name });
      const existing = await permissions.findOne({ filter: { where: { code: 'configuration' } } });
      const permission =
        existing ??
        (
          await permissions.create({
            data: {
              code: 'configuration',
              name: 'Read Configuration',
              subject: 'configuration',
              action: AuthorizationActions.READ,
              method: 'GET',
              scope: 'global',
            },
          })
        ).data;

      const { data: organization } = await repository<OrganizationRepository>({
        name: OrganizationRepository.name,
      }).create({ data: { identifier: `org_${suffix}`, name: 'Smoke Org' } });
      const { data: role } = await repository<RoleRepository>({ name: RoleRepository.name }).create(
        {
          data: { identifier: `role_${suffix}`, name: 'Smoke Reader', priority: 10 },
        },
      );

      const domain = { domainType: Organization.name, domainId: organization.id };
      await repository<PolicyDefinitionRepository>({
        name: PolicyDefinitionRepository.name,
      }).createAll({
        data: [
          {
            ...domain,
            variant: AuthorizationPolicyVariants.ASSIGN_ROLE.action,
            subjectType: 'user',
            subjectId: opts.userId,
            targetType: Role.name,
            targetId: role.id,
          },
          {
            ...domain,
            variant: AuthorizationPolicyVariants.GRANT.action,
            subjectType: Role.name,
            subjectId: role.id,
            targetType: Permission.name,
            targetId: permission.id,
            action: AuthorizationActions.READ,
            effect: AuthorizationDecisions.ALLOW,
          },
        ],
      });

      return { organizationId: organization.id, roleId: role.id };
    };

    let seeded = { organizationId: '', roleId: '' };

    beforeAll(async () => {
      applicationEnvironment.merge({ envs: TEST_ENV });

      const pool = new Pool({
        host: HOST,
        port: POSTGRES_PORT,
        user: TEST_ENV.APP_ENV_POSTGRES_USERNAME,
        password: TEST_ENV.APP_ENV_POSTGRES_PASSWORD,
        database: TEST_ENV.APP_ENV_POSTGRES_DATABASE,
      });
      await migrate(drizzle({ client: pool }), { migrationsFolder: './migration' });
      await pool.end();

      application = new Application({
        scope: 'SmokeTest',
        config: { ...beConfigs, host: HOST, port: 0 },
      });
      application.init();
      await application.start();
      baseUrl = `http://${HOST}:${application.getServerPort()}${beConfigs.path.base}`;

      for (const username of [reader, outsider]) {
        const response = await post({
          path: '/auth/sign-up',
          body: { username, credential: password },
        });
        expect(response.status).toBeLessThan(300);
      }

      const user = await repository<UserRepository>({ name: UserRepository.name }).findByUsername({
        username: reader,
      });
      if (!user) {
        throw getError({ message: '[smoke] The reader was not created by sign-up' });
      }
      seeded = await seedGrant({ userId: user.id });
    });

    afterAll(async () => {
      const policies = repository<PolicyDefinitionRepository>({
        name: PolicyDefinitionRepository.name,
      });
      await policies.deleteAll({ where: { domainId: seeded.organizationId } });
      await repository<RoleRepository>({ name: RoleRepository.name }).deleteById({
        id: seeded.roleId,
      });
      await repository<OrganizationRepository>({ name: OrganizationRepository.name }).deleteById({
        id: seeded.organizationId,
      });
      await repository<ConfigurationRepository>({ name: ConfigurationRepository.name }).deleteAll({
        where: { code: configurationCode },
      });
      await repository<UserRepository>({ name: UserRepository.name }).deleteAll({
        where: { username: { inq: [reader, outsider] } },
      });
      await application.stop();
    });

    test('GET /health-check answers', async () => {
      const response = await fetch(`${baseUrl}/health-check`);
      expect(response.status).toBe(200);
    });

    test('POST /auth/sign-in returns a signed token', async () => {
      for (const username of [reader, outsider]) {
        const response = await post({
          path: '/auth/sign-in',
          body: {
            identifier: { scheme: 'username', value: username },
            credential: { scheme: 'basic', value: password },
          },
        });
        expect(response.status).toBe(200);
        tokens.set(username, SignInResponse.parse(await response.json()).token.value);
      }
    });

    test('POST /configurations with Basic credentials, then GET it with the JWT', async () => {
      const created = await post({
        path: '/configurations',
        headers: { authorization: `Basic ${btoa(`${reader}:${password}`)}` },
        body: { code: configurationCode, group: 'smoke' },
      });
      expect(created.status).toBe(201);
      const { data } = ConfigurationResponse.parse(await created.json());

      const read = await fetch(`${baseUrl}/configurations/${data.id}`, {
        headers: bearer({ username: reader }),
      });
      expect(read.status).toBe(200);
      expect(ConfigurationResponse.parse(await read.json()).data.code).toBe(configurationCode);

      const anonymous = await fetch(`${baseUrl}/configurations/${data.id}`);
      expect(anonymous.status).toBe(401);
    });

    test('Casbin allows the reader and forbids the outsider', async () => {
      const path = `${baseUrl}/authz-example/configurations`;

      const allowed = await fetch(path, { headers: bearer({ username: reader }) });
      expect(allowed.status).toBe(200);

      const forbidden = await fetch(path, { headers: bearer({ username: outsider }) });
      expect(forbidden.status).toBe(403);
    });
  });
});
