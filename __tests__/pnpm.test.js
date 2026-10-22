import { hasDowngrade } from '../lib/index.js';
import { diffPnpm, parsePnpmLock } from '../lib/pnpm.js';

const lock = (body) => parsePnpmLock(`lockfileVersion: '9.0'\n${body}`, 'pnpm-lock.yaml');
const pkgs = (...keys) => lock(`packages:\n${keys.map((key) => `  '${key}': {}\n`).join('')}`);

describe('parsePnpmLock', () => {
  it('models a lockfile missing at a ref as empty', () => {
    expect(diffPnpm(parsePnpmLock(null), pkgs('foo@1.0.0'))).toEqual({ foo: [null, '1.0.0'] });
  });

  it('treats a v9 lockfile without packages or importers as empty', () => {
    expect(diffPnpm(lock(''), lock(''))).toEqual({});
    expect(diffPnpm(lock(''), lock(''), true)).toEqual({});
  });

  it.each(['5.4', '6.0', '10.0', '9abc', 'nope'])('rejects lockfileVersion %s (fail closed)', (version) => {
    expect(() => parsePnpmLock(`lockfileVersion: '${version}'\n`, 'pnpm-lock.yaml')).toThrow(/lockfileVersion/);
  });

  it.each(['9.0', "'9.1'"])('accepts lockfileVersion %s', (version) => {
    expect(() => parsePnpmLock(`lockfileVersion: ${version}\n`, 'pnpm-lock.yaml')).not.toThrow();
  });

  it('rejects multiple YAML documents with a clear error', () => {
    expect(() => parsePnpmLock("lockfileVersion: '9.0'\n---\nlockfileVersion: '9.0'\n", 'pnpm-lock.yaml'))
      .toThrow('Could not parse pnpm-lock.yaml as YAML: multiple YAML documents are not supported');
  });
});

describe('diffPnpm', () => {
  it('reports upgrades, downgrades, adds and removes by package name', () => {
    const changes = diffPnpm(
      pkgs('up@1.0.0', 'down@2.0.0', 'gone@1.0.0', 'same@1.0.0'),
      pkgs('up@1.1.0', 'down@1.0.0', 'new@1.0.0', 'same@1.0.0'));
    expect(changes).toEqual({
      up: ['1.0.0', '1.1.0'],
      down: ['2.0.0', '1.0.0'],
      gone: ['1.0.0', null],
      new: [null, '1.0.0'],
    });
  });

  it('pairs multiple versions of one package highest-first', () => {
    // Bumping both majors while a new one appears is not a downgrade.
    const changes = diffPnpm(pkgs('foo@1.0.0', 'foo@2.0.0'), pkgs('foo@1.1.0', 'foo@2.1.0', 'foo@3.0.0'));
    expect(changes).toEqual({
      'foo@2.0.0': ['2.0.0', '3.0.0'],
      'foo@1.0.0': ['1.0.0', '2.1.0'],
      'foo@1.1.0': [null, '1.1.0'],
    });
    expect(hasDowngrade(changes)).toBe(false);
  });

  it('flags a downgrade when the highest version drops', () => {
    expect(hasDowngrade(diffPnpm(pkgs('foo@1.0.0', 'foo@2.0.0'), pkgs('foo@1.5.0')))).toBe(true);
  });

  it('parses scoped names and git keys, preferring the entry version', () => {
    const before = lock(`packages:
  '@scope/pkg@1.0.0': {}
  'gitdep@git+ssh://git@github.com/o/r.git#abc':
    version: 1.0.0
`);
    const after = lock(`packages:
  '@scope/pkg@1.1.0': {}
  'gitdep@git+ssh://git@github.com/o/r.git#def':
    version: 1.1.0
`);
    expect(diffPnpm(before, after)).toEqual({
      '@scope/pkg': ['1.0.0', '1.1.0'],
      gitdep: ['1.0.0', '1.1.0'],
    });
  });

  it('trusts a semver key over a conflicting entry version', () => {
    const after = lock(`packages:
  'foo@1.0.0':
    version: 2.0.0
`);
    expect(hasDowngrade(diffPnpm(pkgs('foo@2.0.0'), after))).toBe(true);
  });

  it('rejects a package key with no version (fail closed)', () => {
    expect(() => diffPnpm(pkgs('foo'), pkgs())).toThrow(/foo/);
  });

  it('treats a package literally named __proto__ as data', () => {
    const changes = diffPnpm(pkgs('__proto__@1.0.0'), pkgs('__proto__@2.0.0'));
    expect(Object.keys(changes)).toEqual(['__proto__']);
  });

  it('shallow diffs importer direct dependencies with npm-style keys and bare versions', () => {
    const importers = ([react, b, alias, transitive]) => lock(`importers:
  .:
    dependencies:
      react:
        specifier: ^18.0.0
        version: ${react}
  packages/a:
    devDependencies:
      b:
        specifier: ${b}
        version: ${b}
    optionalDependencies:
      strw:
        specifier: npm:string-width@^4.0.0
        version: ${alias}
packages:
  'transitive@${transitive}': {}
`);
    const changes = diffPnpm(
      importers(['18.2.0(react-dom@18.2.0)', 'link:../b', 'string-width@4.2.3', '1.0.0']),
      importers(['18.3.0(react-dom@18.3.0)', '2.0.0', 'string-width@4.3.0', '2.0.0']),
      true);
    expect(changes).toEqual({
      'node_modules/react': ['18.2.0', '18.3.0'],
      'packages/a/node_modules/b': ['link:../b', '2.0.0'],
      'packages/a/node_modules/strw': ['4.2.3', '4.3.0'],
    });
  });
});
