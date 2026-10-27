import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..', '..', '..');
const PATH = join(ROOT, '.github/workflows/atlas-index.yml');

// The atlas index workflow signs with a secret and uploads to a release, so it is read as text and held to
// the same few rules as the release workflow: only push triggers, write access only on the one job that
// uploads, the secret only on the step that publishes, every action by its full commit.
describe('atlas-index.yml', () => {
  const workflow = existsSync(PATH) ? readFileSync(PATH, 'utf8') : '';
  const head = workflow.split(/\njobs:\n/)[0] ?? '';
  const jobs = workflow.split(/\njobs:\n/)[1] ?? '';

  test('the workflow exists', () => {
    expect(workflow.length).toBeGreaterThan(0);
  });

  test('it runs on a push to main or develop, or of a tag, and on nothing else', () => {
    expect(head).toMatch(
      /\non:\n {2}push:\n {4}branches:\n {6}- main\n {6}- develop\n {4}tags:\n {6}- '\*'\n/,
    );
    expect(workflow).not.toContain('pull_request');
    expect(workflow).not.toContain('workflow_dispatch');
    expect(workflow).not.toContain('schedule:');
  });

  test('read-only by default; the one job that uploads can write', () => {
    expect(head).toMatch(/\npermissions:\n {2}contents: read\n/);
    expect(jobs).toMatch(/\n {4}permissions:\n {6}contents: write\n/);
    expect([...workflow.matchAll(/contents: write/g)]).toHaveLength(1);
  });

  test('the key is read only by the step that publishes', () => {
    const steps = jobs.split(/\n {6}- /).slice(1);
    const withKey = steps.filter((step) => step.includes('secrets.'));

    expect(withKey).toHaveLength(1);
    expect(withKey[0]).toContain('uses: VENIZIA-AI/vulcan/.github/actions/atlas-index@');
    expect(withKey[0]).toContain('ATLAS_INDEX_KEY: ${{ secrets.ATLAS_INDEX_KEY }}');
    expect(
      [...workflow.matchAll(/secrets\.(\w+)/g)].every((match) => match[1] === 'ATLAS_INDEX_KEY'),
    ).toBe(true);
  });

  test('every action is pinned by its full commit with the tag in a comment, VULCAN at the commit of the installed release', () => {
    const uses = [...workflow.matchAll(/^\s+uses: (.+)$/gm)].map((match) => match[1] ?? '');
    const vulcanVersion: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
      .devDependencies['@venizia/vulcan'];

    expect(uses.length).toBeGreaterThanOrEqual(3);
    expect(
      uses.every((value) => /^[\w.-]+\/[\w.\/-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/.test(value)),
    ).toBe(true);
    expect(uses.find((value) => value.startsWith('VENIZIA-AI/vulcan/'))).toContain(
      `# v${vulcanVersion}`,
    );
  });

  test('the checkout has the whole history and bun is exact', () => {
    expect(workflow).toMatch(/fetch-depth: 0/);
    expect(workflow).toMatch(/bun-version: \d+\.\d+\.\d+\n/);
  });
});
