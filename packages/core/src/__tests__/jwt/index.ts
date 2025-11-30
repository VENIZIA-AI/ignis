import { TestCase, TestDescribe, TestPlan } from '@/helpers';
import * as TestCases from './test-cases';
import { getUID } from '@/utilities';

TestDescribe.withTestPlan({
  testPlan: TestPlan.newInstance({
    scope: 'JWT',
    hooks: {},
    testCaseResolver: ({ context }) => {
      return [
        TestCase.withOptions({
          code: getUID(),
          description: 'Check create new JWT',
          expectation: 'Successfully create JWT',
          handler: new TestCases.TestCase001({
            context,
            args: {
              payload: {
                userId: 'user_id_1',
                roles: [
                  { id: 'role_1', identifier: 'role_1', priority: 1 },
                  { id: 'role_2', identifier: 'role_2', priority: 2 },
                ],
              },
              jwtExpiresIn: 30, // 30s
              applicationSecret: 'application_secret',
              jwtSecret: 'jwt_secret',
            },
          }),
        }),
      ];
    },
  }),
}).run();
