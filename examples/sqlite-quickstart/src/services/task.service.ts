import { type TaskRepository } from '@/repositories/task.repository';
import {
  BaseService,
  BindingKeys,
  Execution,
  ExecutionModes,
  inject,
  service,
} from '@venizia/ignis';

/** Work with no request behind it, such as a job or a tick: each method says who it runs for. */
@service()
export class TaskService extends BaseService {
  constructor(
    @inject({ key: BindingKeys.build<TaskRepository>({ key: 'repositories.TaskRepository' }) })
    private taskRepository: TaskRepository,
  ) {
    super({ scope: TaskService.name });
  }

  /** One tenant's work: the model's `access` holds the update to that tenant's rows. */
  completeOpenTasks(opts: { tenantId: string }) {
    return Execution.run({
      mode: ExecutionModes.SCOPED,
      values: { tenantId: opts.tenantId },
      task: () => this.taskRepository.updateBy({ where: { done: false }, data: { done: true } }),
    });
  }

  /** Housekeeping across tenants: no row scope, and the run is logged with its reason. */
  purgeDoneTasks() {
    return Execution.run({
      mode: ExecutionModes.SYSTEM,
      reason: 'purge done tasks',
      task: () => this.taskRepository.deleteBy({ where: { done: true } }),
    });
  }
}
