import type { TNodeServerInstance } from '@/base/applications';
import { RuntimeModules, SocketIOServerHelper } from '@venizia/ignis-helpers';
import type { IResolvedBindings, IServerOptions } from '../common';

export async function createNodeSocketIOHelper(opts: {
  serverOptions: Partial<IServerOptions>;
  httpServer: TNodeServerInstance;
  resolvedBindings: IResolvedBindings;
}): Promise<SocketIOServerHelper> {
  const { serverOptions, httpServer, resolvedBindings } = opts;
  const { redisConnection, authenticateFn, validateRoomFn, clientConnectedFn } = resolvedBindings;

  const socketIOHelper = new SocketIOServerHelper({
    runtime: RuntimeModules.NODE,
    identifier: serverOptions.identifier!,
    server: httpServer,
    serverOptions,
    redisConnection,
    authenticateFn,
    validateRoomFn,
    clientConnectedFn,
  });
  await socketIOHelper.configure();

  return socketIOHelper;
}
