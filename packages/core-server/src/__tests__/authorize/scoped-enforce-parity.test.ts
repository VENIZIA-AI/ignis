import { AuthorizationPermissionBuilder } from '@venizia/ignis-kernel';
import { ResourceRoleManager } from '@/components/auth/authorize/role-managers/resource';
import { CASBIN_RBAC_DOMAIN_SCOPED_MODEL } from '@/components/auth/authorize/enforcers/models/rbac-domain.model';
import { describe, expect, it } from 'bun:test';
import { Helper, newEnforcer, newModelFromString, Util } from 'casbin';

const LATTICE = [
  'g5, read, manage',
  'g5, write, manage',
  'g5, execute, manage',
  'g5, create, write',
  'g5, update, write',
  'g5, delete, write',
];

const buildEnforcer = async (opts: { lines: string[] }) => {
  const enforcer = await newEnforcer(newModelFromString(CASBIN_RBAC_DOMAIN_SCOPED_MODEL));
  await enforcer.addNamedDomainMatchingFunc('g', Util.keyMatchFunc);
  await enforcer.addFunction('objectMatch', AuthorizationPermissionBuilder.objectMatch);
  enforcer.setNamedRoleManager('g4', new ResourceRoleManager());

  const model = enforcer.getModel();
  model.clearPolicy();
  for (const line of [
    'g, User_1, Role_1, *',
    'g2, User_1, Merchant_9',
    ...LATTICE,
    ...opts.lines,
  ]) {
    Helper.loadPolicyLine(line, model);
  }
  await enforcer.buildRoleLinks();

  return enforcer;
};

describe('scoped model - resource matching parity via ResourceRoleManager', () => {
  const cases: Array<{
    name: string;
    lines: string[];
    request: [string, string, string, string];
    expected: boolean;
  }> = [
    {
      name: 'direct operation grant',
      lines: ['p, Role_1, ANY_MEMBER, Order.find, read, allow'],
      request: ['User_1', 'Merchant_9', 'Order.find', 'read'],
      expected: true,
    },
    {
      name: 'subject grant covers a nested operation',
      lines: ['p, Role_1, ANY_MEMBER, Order, manage, allow'],
      request: ['User_1', 'Merchant_9', 'Order.deleteById', 'delete'],
      expected: true,
    },
    {
      name: 'module grant covers a nested operation',
      lines: ['g4, Order, Sales', 'p, Role_1, ANY_MEMBER, Sales, manage, allow'],
      request: ['User_1', 'Merchant_9', 'Order.deleteById', 'delete'],
      expected: true,
    },
    {
      name: 'multi-hop module grant',
      lines: [
        'g4, Order, Sales',
        'g4, Sales, Commerce',
        'p, Role_1, ANY_MEMBER, Commerce, manage, allow',
      ],
      request: ['User_1', 'Merchant_9', 'Order.deleteById', 'delete'],
      expected: true,
    },
    {
      name: 'sibling nesting (OrderItem under Order)',
      lines: ['g4, OrderItem, Order', 'p, Role_1, ANY_MEMBER, Order, read, allow'],
      request: ['User_1', 'Merchant_9', 'OrderItem', 'read'],
      expected: true,
    },
    {
      name: 'multi-parent resource DAG',
      lines: ['g4, report.export, data.export', 'p, Role_1, ANY_MEMBER, data.export, read, allow'],
      request: ['User_1', 'Merchant_9', 'report.export', 'read'],
      expected: true,
    },
    {
      name: 'dotted code at depth 2 reaches its module',
      lines: ['g4, Billing, Finance', 'p, Role_1, ANY_MEMBER, Finance, manage, allow'],
      request: ['User_1', 'Merchant_9', 'Billing.Invoice.find', 'read'],
      expected: true,
    },
    {
      name: 'dotted code at depth 3 reaches its module',
      lines: ['g4, Billing, Finance', 'p, Role_1, ANY_MEMBER, Finance, manage, allow'],
      request: ['User_1', 'Merchant_9', 'Billing.Invoice.Line.find', 'read'],
      expected: true,
    },
    {
      name: 'wildcard grant',
      lines: ['p, Role_1, ANY_MEMBER, *, manage, allow'],
      request: ['User_1', 'Merchant_9', 'Order.find', 'read'],
      expected: true,
    },
    {
      name: 'unrelated module denied',
      lines: ['g4, Order, Sales', 'p, Role_1, ANY_MEMBER, Identity, manage, allow'],
      request: ['User_1', 'Merchant_9', 'Order.find', 'read'],
      expected: false,
    },
    {
      name: 'action too narrow denied',
      lines: ['g4, Order, Sales', 'p, Role_1, ANY_MEMBER, Sales, read, allow'],
      request: ['User_1', 'Merchant_9', 'Order.deleteById', 'delete'],
      expected: false,
    },
    {
      name: 'deny row still overrides allow',
      lines: [
        'g4, Order, Sales',
        'p, Role_1, ANY_MEMBER, Sales, manage, allow',
        'p, Role_1, ANY_MEMBER, Order.deleteById, delete, deny',
      ],
      request: ['User_1', 'Merchant_9', 'Order.deleteById', 'delete'],
      expected: false,
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const enforcer = await buildEnforcer({ lines: testCase.lines });
      expect(enforcer.enforceSync(...testCase.request)).toBe(testCase.expected);
    });
  }
});

describe('scoped model - enforce performance guard', () => {
  // Real incident shape: 992 p-lines and 126 g4 nodes took ~700-1000ms with a g4 matching function, and no other authz test asserts on time.
  const SUBJECTS = Array.from({ length: 120 }, (_, index) => `Subject${index}`);
  const MODULES = ['Sales', 'Identity', 'Catalog', 'Ops', 'Finance', 'Report'];
  const METHOD_ACTIONS: Record<string, string> = {
    find: 'read',
    findById: 'read',
    findOne: 'read',
    count: 'read',
    create: 'create',
    updateById: 'update',
    updateBy: 'update',
    deleteById: 'delete',
  };

  it('enforces a 992-line payload in under 50ms', async () => {
    const lines = [
      ...SUBJECTS.map((subject, index) => `g4, ${subject}, ${MODULES[index % MODULES.length]}`),
      ...SUBJECTS.flatMap(subject =>
        Object.entries(METHOD_ACTIONS).map(
          ([method, action]) => `p, Role_1, ANY_MEMBER, ${subject}.${method}, ${action}, allow`,
        ),
      ),
    ];

    const enforcer = await buildEnforcer({ lines });
    const request: [string, string, string, string] = [
      'User_1',
      'Merchant_9',
      'Subject119.deleteById',
      'delete',
    ];

    expect(enforcer.enforceSync(...request)).toBe(true);

    const startedAt = performance.now();
    for (let index = 0; index < 20; index++) {
      enforcer.enforceSync(...request);
    }
    const perEnforce = (performance.now() - startedAt) / 20;

    expect(perEnforce).toBeLessThan(50);
  });
});

describe('scoped enforcer - matching function must not come back', () => {
  it('registerMatchers never calls addNamedMatchingFunc', async () => {
    // __dirname, not import.meta: this package emits CommonJS, and the path must not depend on the CWD `bun test` runs from.
    const source = await Bun.file(
      `${__dirname}/../../components/auth/authorize/enforcers/casbin.enforcer.ts`,
    ).text();

    // Matches the identifier in call position (direct, spaced or bracket-call) so a reintroduction cannot dodge a literal string check; registerMatchers' comment names it followed by `:`, never `(`, so it stays clear.
    const callPattern = /addNamedMatchingFunc\s*['"]?\s*\]?\s*\(/;
    expect(callPattern.test(source)).toBe(false);
  });
});
