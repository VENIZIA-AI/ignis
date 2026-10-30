// Plain code only: no framework, no DOM, no Bun API. A backend app and a frontend app import it alike.
export class Greeting {
  static readonly PACKAGE = '{{package}}';

  static of(opts: { name: string }): string {
    return `Hello, ${opts.name}, from ${Greeting.PACKAGE}!`;
  }
}
