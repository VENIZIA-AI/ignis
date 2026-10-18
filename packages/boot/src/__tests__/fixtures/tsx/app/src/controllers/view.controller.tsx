import { controller } from '@venizia/ignis-kernel';

const Page = () => <main>home</main>;

@controller({ path: '/' })
export class ViewController {
  render() {
    return Page;
  }
}
