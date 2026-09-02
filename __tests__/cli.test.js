import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
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

  it('accepts a numeric --max-buffer value without erroring', () => {
    // Regression: `-m/--max-buffer` used to be defined as a boolean flag, so
    // passing a value produced "too many arguments" (exit 1).
    expect(run('HEAD~2', 'HEAD~1', '--max-buffer', '5000000').status).toBe(0);
  });

  it('does not execute a shell payload embedded in a ref (command injection)', () => {
    // Regression: refs were interpolated into a shell string via `exec`, so
    // `$(...)` in a ref executed. With execFile the ref is a literal argument.
    const canary = join(repo, 'INJECTED');
    if (existsSync(canary)) unlinkSync(canary);

    const result = run(`HEAD~1$(touch ${canary})`, 'HEAD');

    expect(existsSync(canary)).toBe(false); // payload must not have run
    expect(result.status).not.toBe(0);      // invalid ref should fail cleanly
  });
});

// Adding or removing a package-lock.json between the two refs means `git show`
// cannot read it at one end; that must be reported as added/removed, not abort
// the whole run.
describe('diff-lockfiles CLI added/removed lockfiles', () => {
  let repo;

  const git = (...args) =>
    spawnSync('git', args, { cwd: repo, encoding: 'utf8' });

  const run = (...args) =>
    spawnSync('node', [bin, ...args], { cwd: repo, encoding: 'utf8' });

  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'diff-lockfiles-addrm-'));
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    // HEAD~1 has no lockfile; HEAD adds one.
    writeFileSync(join(repo, 'README.md'), 'seed');
    git('add', '-A');
    git('commit', '-qm', 'no lockfile');
    writeFileSync(join(repo, 'package-lock.json'), lockfile('4.17.21'));
    git('add', '-A');
    git('commit', '-qm', 'add lockfile');
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('reports an added lockfile and exits 0', () => {
    const result = run('HEAD~1', 'HEAD', '--format', 'text');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/added/);
  });

  it('reports a removed lockfile and exits 0', () => {
    const result = run('HEAD', 'HEAD~1', '--format', 'text');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/removed/);
  });
});
