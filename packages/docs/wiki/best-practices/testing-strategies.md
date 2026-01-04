# Testing Strategies

Comprehensive testing guide for Ignis applications using Bun's built-in test runner.

## Testing Philosophy

| Principle | Description |
|-----------|-------------|
| **Test Behavior** | Test what the code does, not how it does it |
| **Isolation** | Each test should be independent |
| **Fast Feedback** | Tests should run quickly |
| **Meaningful Coverage** | Cover critical paths and edge cases |

## 1. Project Setup

### Configure Test Environment

**`bunfig.toml`:**
```toml
[test]
preload = ["./test/setup.ts"]
coverage = true
coverageDir = "coverage"
```

**`test/setup.ts`:**
```typescript
import { beforeAll, afterAll, afterEach } from 'bun:test';
import { TestDatabase } from './helpers/test-database';

// Global setup
beforeAll(async () => {
  await TestDatabase.initialize();
});

// Clean up after each test
afterEach(async () => {
  await TestDatabase.truncateAll();
});

// Global teardown
afterAll(async () => {
  await TestDatabase.close();
});
```

**`test/helpers/test-database.ts`:**
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@/models';

export class TestDatabase {
  private static pool: Pool;
  private static db: ReturnType<typeof drizzle>;

  static async initialize() {
    this.pool = new Pool({
      host: process.env.TEST_DB_HOST ?? 'localhost',
      port: Number(process.env.TEST_DB_PORT ?? 5433),
      user: process.env.TEST_DB_USER ?? 'test',
      password: process.env.TEST_DB_PASSWORD ?? 'test',
      database: process.env.TEST_DB_NAME ?? 'ignis_test',
    });
    this.db = drizzle({ client: this.pool, schema });
  }

  static getDb() {
    return this.db;
  }

  static async truncateAll() {
    const tables = Object.keys(schema);
    for (const table of tables) {
      await this.db.execute(sql`TRUNCATE TABLE ${sql.identifier(table)} CASCADE`);
    }
  }

  static async close() {
    await this.pool.end();
  }
}
```

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/__tests__/user.service.test.ts

# Run tests matching pattern
bun test --grep "UserService"

# Watch mode
bun test --watch

# With coverage
bun test --coverage

# With specific environment
NODE_ENV=test bun test --env-file=.env.test
```

## 2. Unit Testing Services

Test business logic in isolation by mocking dependencies.

**`src/services/__tests__/user.service.test.ts`:**
```typescript
import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { UserService } from '../user.service';
import type { IUserRepository } from '@/repositories';

describe('UserService', () => {
  let service: UserService;
  let mockRepo: IUserRepository;

  beforeEach(() => {
    // Create mock repository
    mockRepo = {
      findById: mock(() => Promise.resolve({ data: null })),
      findOne: mock(() => Promise.resolve({ data: null })),
      create: mock((opts) => Promise.resolve({ data: { id: 'new-id', ...opts.data }, count: 1 })),
      updateById: mock(() => Promise.resolve({ data: null, count: 0 })),
    } as unknown as IUserRepository;

    // Inject mock
    service = new UserService(mockRepo);
  });

  describe('createUser', () => {
    it('should create a user with valid data', async () => {
      const userData = { email: 'test@example.com', name: 'Test User' };

      const result = await service.createUser(userData);

      expect(result.data).toMatchObject({
        id: 'new-id',
        email: 'test@example.com',
        name: 'Test User',
      });
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    it('should throw error for duplicate email', async () => {
      mockRepo.findOne = mock(() => Promise.resolve({
        data: { id: 'existing', email: 'test@example.com' },
      }));

      await expect(
        service.createUser({ email: 'test@example.com', name: 'Test' })
      ).rejects.toThrow('Email already exists');
    });

    it('should hash password before storing', async () => {
      const userData = { email: 'test@example.com', name: 'Test', password: 'secret123' };

      await service.createUser(userData);

      const createCall = (mockRepo.create as ReturnType<typeof mock>).mock.calls[0][0];
      expect(createCall.data.password).not.toBe('secret123');
      expect(createCall.data.password).toMatch(/^\$2[aby]?\$/); // bcrypt hash
    });
  });

  describe('updateUser', () => {
    it('should throw NotFound when user does not exist', async () => {
      mockRepo.findById = mock(() => Promise.resolve({ data: null }));

      await expect(
        service.updateUser('nonexistent', { name: 'New Name' })
      ).rejects.toThrow('User not found');
    });

    it('should only update provided fields', async () => {
      mockRepo.findById = mock(() => Promise.resolve({
        data: { id: '1', email: 'old@test.com', name: 'Old Name' },
      }));
      mockRepo.updateById = mock((opts) => Promise.resolve({
        data: { ...opts.data, id: opts.id },
        count: 1,
      }));

      await service.updateUser('1', { name: 'New Name' });

      const updateCall = (mockRepo.updateById as ReturnType<typeof mock>).mock.calls[0][0];
      expect(updateCall.data).toEqual({ name: 'New Name' });
      expect(updateCall.data.email).toBeUndefined();
    });
  });
});
```

## 3. Integration Testing Repositories

Test repositories with a real (test) database.

**`src/repositories/__tests__/user.repository.test.ts`:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { UserRepository } from '../user.repository';
import { TestDatabase } from '@test/helpers/test-database';
import { User } from '@/models';

describe('UserRepository', () => {
  let repo: UserRepository;

  beforeEach(async () => {
    const db = TestDatabase.getDb();
    repo = new UserRepository(db);
  });

  afterEach(async () => {
    await TestDatabase.truncateAll();
  });

  describe('create', () => {
    it('should create a user and return with generated id', async () => {
      const result = await repo.create({
        data: { email: 'test@example.com', name: 'Test User' },
      });

      expect(result.data).toMatchObject({
        email: 'test@example.com',
        name: 'Test User',
      });
      expect(result.data?.id).toBeDefined();
      expect(result.count).toBe(1);
    });

    it('should enforce unique email constraint', async () => {
      await repo.create({
        data: { email: 'test@example.com', name: 'First' },
      });

      await expect(
        repo.create({ data: { email: 'test@example.com', name: 'Second' } })
      ).rejects.toThrow(); // Unique constraint violation
    });
  });

  describe('find', () => {
    beforeEach(async () => {
      // Seed test data
      await repo.createMany({
        data: [
          { email: 'alice@test.com', name: 'Alice', status: 'ACTIVE' },
          { email: 'bob@test.com', name: 'Bob', status: 'ACTIVE' },
          { email: 'charlie@test.com', name: 'Charlie', status: 'INACTIVE' },
        ],
      });
    });

    it('should filter by status', async () => {
      const result = await repo.find({
        filter: { where: { status: 'ACTIVE' } },
      });

      expect(result.data).toHaveLength(2);
      expect(result.data.map(u => u.name)).toContain('Alice');
      expect(result.data.map(u => u.name)).toContain('Bob');
    });

    it('should support pagination', async () => {
      const page1 = await repo.find({
        filter: { limit: 2, offset: 0, order: ['name ASC'] },
      });
      const page2 = await repo.find({
        filter: { limit: 2, offset: 2, order: ['name ASC'] },
      });

      expect(page1.data).toHaveLength(2);
      expect(page1.data[0].name).toBe('Alice');
      expect(page2.data).toHaveLength(1);
      expect(page2.data[0].name).toBe('Charlie');
    });

    it('should support complex filters', async () => {
      const result = await repo.find({
        filter: {
          where: {
            or: [
              { name: { like: 'A%' } },
              { status: 'INACTIVE' },
            ],
          },
        },
      });

      expect(result.data).toHaveLength(2);
      expect(result.data.map(u => u.name)).toContain('Alice');
      expect(result.data.map(u => u.name)).toContain('Charlie');
    });
  });

  describe('relations', () => {
    it('should load related entities', async () => {
      // Assuming User has Posts relation
      const user = await repo.create({
        data: { email: 'author@test.com', name: 'Author' },
      });

      // Create posts for the user
      const postRepo = new PostRepository(TestDatabase.getDb());
      await postRepo.createMany({
        data: [
          { title: 'Post 1', authorId: user.data!.id },
          { title: 'Post 2', authorId: user.data!.id },
        ],
      });

      const result = await repo.findById({
        id: user.data!.id,
        filter: { include: [{ relation: 'posts' }] },
      });

      expect(result.data?.posts).toHaveLength(2);
    });
  });
});
```

## 4. E2E Testing Controllers

Test full request/response cycle using Hono's test client.

**`src/controllers/__tests__/user.controller.test.ts`:**
```typescript
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test';
import { testClient } from 'hono/testing';
import { Application } from '@/application';
import { TestDatabase } from '@test/helpers/test-database';

describe('UserController E2E', () => {
  let app: Application;
  let client: ReturnType<typeof testClient>;

  beforeAll(async () => {
    await TestDatabase.initialize();
    app = new Application();
    await app.boot();
    client = testClient(app.server);
  });

  afterEach(async () => {
    await TestDatabase.truncateAll();
  });

  afterAll(async () => {
    await TestDatabase.close();
  });

  describe('POST /api/users', () => {
    it('should create a user with valid data', async () => {
      const response = await client.api.users.$post({
        json: {
          email: 'test@example.com',
          name: 'Test User',
          password: 'SecurePass123!',
        },
      });

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body.email).toBe('test@example.com');
      expect(body.id).toBeDefined();
      expect(body.password).toBeUndefined(); // Should not expose password
    });

    it('should return 422 for invalid email', async () => {
      const response = await client.api.users.$post({
        json: {
          email: 'not-an-email',
          name: 'Test',
          password: 'SecurePass123!',
        },
      });

      expect(response.status).toBe(422);
      const body = await response.json();
      expect(body.details.cause[0].path).toBe('email');
    });

    it('should return 409 for duplicate email', async () => {
      // First create
      await client.api.users.$post({
        json: { email: 'test@example.com', name: 'First', password: 'Pass123!' },
      });

      // Duplicate
      const response = await client.api.users.$post({
        json: { email: 'test@example.com', name: 'Second', password: 'Pass123!' },
      });

      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return user by id', async () => {
      // Create user first
      const createRes = await client.api.users.$post({
        json: { email: 'test@example.com', name: 'Test', password: 'Pass123!' },
      });
      const created = await createRes.json();

      const response = await client.api.users[':id'].$get({
        param: { id: created.id },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.id).toBe(created.id);
      expect(body.email).toBe('test@example.com');
    });

    it('should return 404 for nonexistent user', async () => {
      const response = await client.api.users[':id'].$get({
        param: { id: 'nonexistent-uuid' },
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Protected Routes', () => {
    let authToken: string;

    beforeEach(async () => {
      // Create user and get token
      await client.api.users.$post({
        json: { email: 'auth@test.com', name: 'Auth User', password: 'Pass123!' },
      });
      const loginRes = await client.api.auth.login.$post({
        json: { email: 'auth@test.com', password: 'Pass123!' },
      });
      const { token } = await loginRes.json();
      authToken = token;
    });

    it('should return 401 without token', async () => {
      const response = await client.api.users.me.$get();
      expect(response.status).toBe(401);
    });

    it('should return user profile with valid token', async () => {
      const response = await client.api.users.me.$get({
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.email).toBe('auth@test.com');
    });
  });
});
```

## 5. Mocking Patterns

### Mock External Services

```typescript
import { mock } from 'bun:test';

// Mock email service
const mockEmailService = {
  send: mock(() => Promise.resolve({ messageId: 'mock-id' })),
  sendBulk: mock(() => Promise.resolve({ sent: 10, failed: 0 })),
};

// Mock Redis
const mockRedis = {
  get: mock((key: string) => Promise.resolve(null)),
  set: mock(() => Promise.resolve('OK')),
  del: mock(() => Promise.resolve(1)),
};

// Reset mocks between tests
beforeEach(() => {
  mockEmailService.send.mockClear();
  mockRedis.get.mockClear();
});
```

### Mock Time

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

describe('Time-dependent tests', () => {
  const realDate = Date;

  beforeEach(() => {
    // Mock Date to fixed time
    const mockDate = new Date('2024-01-15T10:00:00Z');
    global.Date = class extends realDate {
      constructor() {
        super();
        return mockDate;
      }
      static now() {
        return mockDate.getTime();
      }
    } as DateConstructor;
  });

  afterEach(() => {
    global.Date = realDate;
  });

  it('should use mocked time', () => {
    const now = new Date();
    expect(now.toISOString()).toBe('2024-01-15T10:00:00.000Z');
  });
});
```

### Spy on Methods

```typescript
import { spyOn } from 'bun:test';

it('should call logger on error', async () => {
  const loggerSpy = spyOn(service.logger, 'error');

  await expect(service.riskyOperation()).rejects.toThrow();

  expect(loggerSpy).toHaveBeenCalledWith(
    expect.stringContaining('Operation failed'),
    expect.any(Error)
  );
});
```

## 6. Test Organization

### File Structure

```
src/
├── services/
│   ├── user.service.ts
│   └── __tests__/
│       └── user.service.test.ts
├── repositories/
│   ├── user.repository.ts
│   └── __tests__/
│       └── user.repository.test.ts
└── controllers/
    ├── user.controller.ts
    └── __tests__/
        └── user.controller.test.ts
test/
├── setup.ts
├── helpers/
│   ├── test-database.ts
│   └── fixtures.ts
└── e2e/
    └── full-flow.test.ts
```

### Test Naming Convention

```typescript
describe('UserService', () => {
  describe('createUser', () => {
    it('should create user with valid data', () => {});
    it('should throw ValidationError for invalid email', () => {});
    it('should throw ConflictError for duplicate email', () => {});
  });

  describe('updateUser', () => {
    describe('when user exists', () => {
      it('should update provided fields only', () => {});
    });

    describe('when user does not exist', () => {
      it('should throw NotFoundError', () => {});
    });
  });
});
```

## 7. Coverage Guidelines

| Category | Target | Priority |
|----------|--------|----------|
| Services (business logic) | > 80% | High |
| Repositories (data access) | > 70% | Medium |
| Controllers (E2E) | > 60% | Medium |
| Utilities/Helpers | > 90% | High |

**Generate coverage report:**
```bash
bun test --coverage

# Coverage summary will be in ./coverage/
```

## Testing Checklist

| Category | Check |
|----------|-------|
| **Setup** | Test database configured and isolated |
| **Unit** | Services tested with mocked dependencies |
| **Integration** | Repositories tested with real database |
| **E2E** | Critical user flows covered |
| **Edge Cases** | Error conditions and boundaries tested |
| **Security** | Auth/authz scenarios tested |
| **Performance** | Slow tests identified and optimized |

## See Also

- [Error Handling](./error-handling) - Test error scenarios
- [Common Pitfalls](./common-pitfalls) - Testing mistakes to avoid
- [API Usage Examples](./api-usage-examples) - What to test
