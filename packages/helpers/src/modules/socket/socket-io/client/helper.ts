import { ModuleUtility } from '@/utilities/module.utility';
import { SocketIOClientHelper as BrowserSocketIOClientHelper } from './browser-helper';

/**
 * The socket.io client for a server or a CLI: the browser-pure helper, plus a `socket.io-client`
 * found in the app's `node_modules` when no `module` is handed in. A browser bundle imports
 * `@venizia/ignis-helpers/socket-io/client` instead, which has no node dependency.
 */
export class SocketIOClientHelper extends BrowserSocketIOClientHelper {
  // `socket.io-client` is an optional peer: loaded on connect, so a server that only imports the
  // server helper from this entry never needs it installed.
  protected override resolveModule(): typeof import('socket.io-client') {
    return (
      this.clientModule ??
      ModuleUtility.loadSync<typeof import('socket.io-client')>({ module: 'socket.io-client' })
    );
  }
}
