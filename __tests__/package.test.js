import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('npm package contents', () => {
  it('packs only the files allowlisted in package.json', () => {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(0);
    const files = JSON.parse(result.stdout)[0].files.map((f) => f.path).sort();
    expect(files).toEqual([
      'CHANGELOG.md',
      'README.md',
      'bin/diff-lockfiles.js',
      'lib/index.js',
      'package.json',
    ]);
  });
});
