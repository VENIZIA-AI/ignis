// Run in a child process: useRepoTmp replaces Bun.spawn for the whole process, which a test run must not carry.
import { useRepoTmp } from '../../../testing/repo-tmp';

const [root] = process.argv.slice(2);
const first = useRepoTmp({ root });
const second = useRepoTmp({ root });
const child = Bun.spawnSync({ cmd: ['sh', '-c', 'printf "%s" "$TMPDIR"'] });
const explicit = Bun.spawnSync({
  cmd: ['sh', '-c', 'printf "%s" "$TMPDIR"'],
  env: { ...process.env, TMPDIR: '/explicit' },
});

console.log(
  JSON.stringify({
    first,
    second,
    ceiling: process.env.GIT_CEILING_DIRECTORIES,
    child: child.stdout.toString(),
    explicit: explicit.stdout.toString(),
  }),
);
