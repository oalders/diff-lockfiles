import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

describe('npm package contents', () => {
  it('packs only the allowlisted files plus what npm always includes', () => {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' });
    // Includes stderr so a failed npm pack shows npm's error in the diff.
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: expect.any(String) });
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
