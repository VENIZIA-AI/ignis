import type { SayHelloRequest } from '@/controllers/greeter/definition';
import { BaseService, service } from '@venizia/ignis';

@service()
export class GreeterService extends BaseService {
  constructor() {
    super({ scope: 'GreeterService' });
  }

  async sayHello(opts: { request: SayHelloRequest }): Promise<string> {
    const name = opts.request.name || 'World';
    return `Hello, ${name}!`;
  }
}
