import { BaseService } from '@venizia/ignis';

// A backend app binds it like its own services: `this.service(GreetingService)` in its application.
export class GreetingService extends BaseService {
  constructor() {
    super({ scope: GreetingService.name });
  }

  greet(opts: { name: string }): string {
    return `Hello, ${opts.name}!`;
  }
}
