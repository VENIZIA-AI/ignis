import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const PATH = join(ROOT, '.github/workflows/deploy-docs.yml');

interface IStep {
  name?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
  run?: string;
}

interface IJob {
  name?: string;
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  steps?: IStep[];
}

interface IWorkflow {
  name?: string;
  'run-name'?: string;
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, IJob>;
}

// The Docs workflow deploys the wiki and, in another job, signs the atlas index with a secret and uploads it to a
// release. It is read as text and held to the same few rules as the release workflow: the triggers of the two
// workflows it replaced, write access only on the one job that uploads, the secret only on the step that publishes,
// every action of that job by its full commit.
describe('deploy-docs.yml', () => {
  const workflow = existsSync(PATH) ? readFileSync(PATH, 'utf8') : '';
  const parsed = (workflow === '' ? {} : Bun.YAML.parse(workflow)) as IWorkflow;
  const jobs = parsed.jobs ?? {};
  const atlas = jobs['atlas-index'];
  const atlasText = workflow.slice(workflow.indexOf('\n  atlas-index:\n'));

  test('the workflow exists and is the one called Docs, titled by its branch', () => {
    expect(workflow.length).toBeGreaterThan(0);
    expect(parsed.name).toBe('Docs');
    expect(parsed['run-name']).toBe('Docs · ${{ github.ref_name }}');
  });

  test('it has the jobs of the two workflows it replaced and the check that gates the wiki', () => {
    expect(Object.keys(jobs).sort()).toEqual(['atlas-index', 'build', 'changes', 'deploy']);
  });

  test('it runs on a push to main or develop, or of a tag, and on a manual run, and on nothing else', () => {
    expect(Object.keys(parsed.on ?? {}).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(parsed.on?.['push']).toEqual({ branches: ['main', 'develop'], tags: ['*'] });
    expect(workflow).not.toContain('pull_request');
    expect(workflow).not.toContain('schedule:');
  });

  test('the wiki is built and deployed only when the check says so: docs/wiki changed on develop, or a manual run', () => {
    expect(jobs['build']?.needs).toBe('changes');
    expect(jobs['build']?.if).toBe("needs.changes.outputs.docs == 'true'");
    expect(jobs['deploy']?.needs).toBe('build');
    expect(workflow).toContain('git diff --quiet "$BEFORE" "$GITHUB_SHA" -- docs/wiki');
    expect(workflow).toContain('[ "$REF" = "refs/heads/develop" ]');
    expect(workflow).not.toMatch(/\n {4}paths:/);
  });

  test('the atlas index is published on a push, and a manual run does not start it', () => {
    expect(atlas?.if).toBe("github.event_name == 'push'");
  });

  test('read-only by default; Pages access only on the two wiki jobs; the one job that uploads can write', () => {
    expect(parsed.permissions).toEqual({ contents: 'read' });
    expect(jobs['build']?.permissions).toEqual({
      contents: 'read',
      pages: 'write',
      'id-token': 'write',
    });
    expect(jobs['deploy']?.permissions).toEqual({
      contents: 'read',
      pages: 'write',
      'id-token': 'write',
    });
    expect(atlas?.permissions).toEqual({ contents: 'write' });
    expect(jobs['changes']?.permissions).toBeUndefined();
    expect([...workflow.matchAll(/contents: write/g)]).toHaveLength(1);
    expect([...workflow.matchAll(/id-token: write/g)]).toHaveLength(2);
  });

  test('the Pages deployments queue in one group, and each ref has its own atlas queue', () => {
    expect(jobs['deploy']?.concurrency).toEqual({ group: 'pages', 'cancel-in-progress': false });
    expect(atlas?.concurrency?.group).toBe('atlas-index-${{ github.ref }}');
  });

  test('the key is read only by the step that publishes', () => {
    const withKey = (atlas?.steps ?? []).filter((step) =>
      JSON.stringify(step).includes('secrets.'),
    );

    expect(withKey).toHaveLength(1);
    expect(withKey[0]?.uses).toStartWith('VENIZIA-AI/vulcan/.github/actions/atlas-index@');
    expect(withKey[0]?.env).toEqual({ ATLAS_INDEX_KEY: '${{ secrets.ATLAS_INDEX_KEY }}' });
    expect(
      [...workflow.matchAll(/secrets\.(\w+)/g)].every((match) => match[1] === 'ATLAS_INDEX_KEY'),
    ).toBe(true);
  });

  test('every action of the atlas job is pinned by its full commit with the tag in a comment, VULCAN at the commit of the installed release', () => {
    const uses = [...atlasText.matchAll(/^\s+uses: (.+)$/gm)].map((match) => match[1] ?? '');
    const vulcanVersion: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
      .devDependencies['@venizia/vulcan'];

    expect(uses.length).toBe(3);
    expect(
      uses.every((value) => /^[\w.-]+\/[\w.\/-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/.test(value)),
    ).toBe(true);
    expect(uses.find((value) => value.startsWith('VENIZIA-AI/vulcan/'))).toContain(
      `# v${vulcanVersion}`,
    );
  });

  test('the checkout of the atlas job has the whole history and its bun is exact', () => {
    expect(atlasText).toMatch(/fetch-depth: 0/);
    expect(atlasText).toMatch(/bun-version: \d+\.\d+\.\d+\n/);
  });
});
