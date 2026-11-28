// Execution frames over a model with `access`: boots the real application with an in-memory database.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import AutoArtifacts from '@venizia/ignis-boot/auto';
import { BindingKeys, Execution, ExecutionModes, RepositoryErrorCodes } from '@venizia/ignis';
import { AppEnvs } from '@venizia/ignis-helpers';
import { RejectionUtility } from '@venizia/dev-configs/testing';
import { Application } from '../application';
import type { TaskRepository } from '../repositories/task.repository';
import type { TaskService } from '../services/task.service';

describe('sqlite-quickstart: execution frames', () => {
  let application: Application;
  let repository: TaskRepository;
  let service: TaskService;

  /** Reads every tenant's rows, to see what a call really changed. */
  const readAll = () =>
    Execution.run({
      mode: ExecutionModes.SYSTEM,
      reason: 'test reads every task',
      task: () => repository.find({ filter: { order: ['title ASC'] } }),
    });

  beforeAll(async () => {
    AppEnvs.set('APP_ENV_SQLITE_URL', ':memory:');

    application = new Application({
      scope: 'TaskTest',
      config: {
        host: '127.0.0.1',
        port: 0,
        path: { base: '/api', isStrict: false },
        artifacts: AutoArtifacts,
      },
    });
    application.init();
    await application.start();

    repository = application.get({
      key: BindingKeys.build<TaskRepository>({ key: 'repositories.TaskRepository' }),
    });
    service = application.get({
      key: BindingKeys.build<TaskService>({ key: 'services.TaskService' }),
    });

    await Execution.run({
      mode: ExecutionModes.SYSTEM,
      reason: 'test seeds two tenants',
      task: () =>
        repository.createAll({
          data: [
            { tenantId: 'a', title: 'a1' },
            { tenantId: 'a', title: 'a2' },
            { tenantId: 'b', title: 'b1' },
          ],
        }),
    });
  });

  afterAll(async () => {
    await application.stop();
  });

  test('outside every frame a read finds nothing and a write is refused', async () => {
    const rows = await repository.find({ filter: {} });
    expect(rows).toEqual([]);

    const write = repository.updateBy({ where: { done: false }, data: { done: true } });
    const error = await RejectionUtility.rejectionOf({ task: write });
    expect(error).toMatchObject({
      statusCode: 403,
      normalized: { code: RepositoryErrorCodes.SCOPE_WRITE_DENIED },
    });
  });

  test('a scoped job changes only the rows of its tenant', async () => {
    const { count } = await service.completeOpenTasks({ tenantId: 'a' });
    expect(count).toBe(2);

    const rows = await readAll();
    expect(rows.map((row) => [row.title, row.done])).toEqual([
      ['a1', true],
      ['a2', true],
      ['b1', false],
    ]);
  });

  test('a system run reaches every tenant', async () => {
    await service.completeOpenTasks({ tenantId: 'b' });

    const { count } = await service.purgeDoneTasks();
    expect(count).toBe(3);

    const rows = await readAll();
    expect(rows).toEqual([]);
  });
});
