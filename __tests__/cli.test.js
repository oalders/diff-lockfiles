import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../bin/diff-lockfiles.js', import.meta.url));

function lockfile(lodashVersion) {
  return JSON.stringify({
    packages: {
      '': { dependencies: { lodash: `^${lodashVersion}` } },
      'node_modules/lodash': { version: lodashVersion },
    },
  });
}

// Build a throwaway git repo whose package-lock.json is upgraded then downgraded
// across three commits: HEAD~2 (base) -> HEAD~1 (upgrade) -> HEAD (downgrade).
describe('diff-lockfiles CLI exit codes', () => {
  let repo;

  const git = (...args) =>
    spawnSync('git', args, { cwd: repo, encoding: 'utf8' });

  const commit = (contents, message) => {
    writeFileSync(join(repo, 'package-lock.json'), contents);
    git('add', '-A');
    git('commit', '-qm', message);
  };

  const run = (...args) =>
    spawnSync('node', [bin, ...args], { cwd: repo, encoding: 'utf8' });

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'diff-lockfiles-cli-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    commit(lockfile('4.17.15'), 'base');
    commit(lockfile('4.17.21'), 'upgrade');
    commit(lockfile('4.17.11'), 'downgrade');
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('exits 0 when --fail-on-downgrade sees only upgrades', () => {
    expect(run('HEAD~2', 'HEAD~1', '--fail-on-downgrade').status).toBe(0);
  });

  it('exits 2 when --fail-on-downgrade sees a downgrade', () => {
    expect(run('HEAD~1', 'HEAD', '--fail-on-downgrade').status).toBe(2);
  });

  it('exits 0 on a downgrade when the flag is absent', () => {
    expect(run('HEAD~1', 'HEAD').status).toBe(0);
  });

  it('exits 1 on an invalid git ref', () => {
    expect(run('nope-a', 'nope-b', '--fail-on-downgrade').status).toBe(1);
  });
});
