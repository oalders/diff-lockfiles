import { diff, format, hasDowngrade, print } from '../lib/index.js';

const pkg = (name, version) => ({ [`node_modules/${name}`]: { version } });

describe('diff', () => {
  it('returns an empty object when given two empty objects', () => {
    const oldLock = {
      packages: {},
    };

    const newLock = {
      packages: {},
    };

    const changes = diff(oldLock, newLock);

    expect(changes).toEqual({});
  });

  it('reports upgrades, downgrades, adds and removes', () => {
    const oldLock = { packages: { ...pkg('up', '1.0.0'), ...pkg('down', '2.0.0'), ...pkg('gone', '1.0.0') } };
    const newLock = { packages: { ...pkg('up', '1.1.0'), ...pkg('down', '1.0.0'), ...pkg('new', '1.0.0') } };

    expect(diff(oldLock, newLock)).toEqual({
      'node_modules/up': ['1.0.0', '1.1.0'],
      'node_modules/down': ['2.0.0', '1.0.0'],
      'node_modules/gone': ['1.0.0', null],
      'node_modules/new': [null, '1.0.0'],
    });
  });

  it('omits packages whose version is unchanged', () => {
    const lock = { packages: pkg('same', '1.0.0') };
    expect(diff(lock, structuredClone(lock))).toEqual({});
  });

  it('diffs an empty packages object as all-added / all-removed', () => {
    // An empty (but present) `packages` map is how the CLI models a lockfile
    // that was added or removed between the two refs.
    expect(diff({ packages: {} }, { packages: pkg('new', '1.0.0') })).toEqual({
      'node_modules/new': [null, '1.0.0'],
    });
    expect(diff({ packages: pkg('gone', '1.0.0') }, { packages: {} })).toEqual({
      'node_modules/gone': ['1.0.0', null],
    });
  });

  it('throws (fail-closed) when a lockfile has no packages field', () => {
    // A missing `packages` map (e.g. a legacy npm v1 lockfile) must fail loudly
    // rather than diff as empty, or a downgrade could slip past the gate.
    expect(() => diff({}, { packages: {} })).toThrow(/packages/);
    expect(() => diff({ packages: {} }, {})).toThrow(/packages/);
  });

  it('does not crash on a null package descriptor', () => {
    const oldLock = { packages: { 'node_modules/broken': null } };
    const newLock = { packages: { 'node_modules/broken': { version: '1.0.0' } } };
    expect(() => diff(oldLock, newLock)).not.toThrow();
    expect(diff(oldLock, newLock)).toEqual({
      'node_modules/broken': [null, '1.0.0'],
    });
  });

  it('treats a package literally named __proto__ as data, not prototype pollution', () => {
    // Build via JSON.parse (not an object literal, which would set the
    // prototype) to get a real own `__proto__` data key, as a crafted lockfile
    // would.
    const oldLock = { packages: JSON.parse('{"__proto__": {"version": "1.0.0"}}') };
    const newLock = { packages: JSON.parse('{"__proto__": {"version": "2.0.0"}}') };

    const changes = diff(oldLock, newLock);

    expect(({}).polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
    // Assert on the enumerable keys: on a plain-object accumulator `__proto__`
    // is swallowed by the prototype setter and never appears here, so this is
    // what actually discriminates the null-prototype fix from the bug.
    expect(Object.keys(changes)).toContain('__proto__');
    expect(JSON.parse(JSON.stringify(changes))['__proto__']).toEqual(['1.0.0', '2.0.0']);
  });

  describe('shallow', () => {
    const oldLock = {
      packages: {
        '': { name: 'root', version: '0.0.0', dependencies: { direct: '^1.0.0' } },
        ...pkg('direct', '1.0.0'),
        ...pkg('transitive', '1.0.0'),
      },
    };
    const newLock = {
      packages: {
        '': { name: 'root', version: '0.0.0', dependencies: { direct: '^2.0.0' } },
        ...pkg('direct', '2.0.0'),
        ...pkg('transitive', '2.0.0'),
      },
    };

    it('only includes direct dependencies', () => {
      expect(diff(oldLock, newLock, true)).toEqual({
        'node_modules/direct': ['1.0.0', '2.0.0'],
      });
    });

    it('does not throw when a lockfile has no root "" package entry', () => {
      const noRoot = { packages: pkg('direct', '1.0.0') };
      expect(() => diff(noRoot, noRoot, true)).not.toThrow();
    });
  });
});

describe('print', () => {
  let logs;
  let originalLog;

  beforeEach(() => {
    logs = [];
    originalLog = console.log;
    console.log = (line) => logs.push(String(line));
  });

  afterEach(() => {
    console.log = originalLog;
  });

  const changes = { 'node_modules/lodash': ['4.17.11', '4.17.21'] };

  it('text format prints the title so multi-file output is distinguishable', () => {
    print(changes, { format: 'text', title: 'a/package-lock.json' });
    expect(logs.join('\n')).toMatch(/a\/package-lock\.json/);
    expect(logs.join('\n')).toMatch(/lodash 4\.17\.11 -> 4\.17\.21/);
  });

  it('json format emits parseable JSON', () => {
    print(changes, { format: 'json', title: 'a/package-lock.json' });
    expect(JSON.parse(logs[0])).toEqual(changes);
  });
});

describe('hasDowngrade', () => {
  it('returns false when there are no changes', () => {
    expect(hasDowngrade({})).toBe(false);
  });

  it('returns false when every change is an upgrade', () => {
    const changes = {
      'node_modules/lodash': ['4.17.11', '4.17.15'],
      'node_modules/semver': ['7.5.4', '7.6.0'],
    };

    expect(hasDowngrade(changes)).toBe(false);
  });

  it('returns true when a package version is decremented', () => {
    const changes = {
      'node_modules/lodash': ['4.17.11', '4.17.15'],
      'node_modules/semver': ['7.6.0', '7.5.4'],
    };

    expect(hasDowngrade(changes)).toBe(true);
  });

  it('does not treat added or removed packages as downgrades', () => {
    const changes = {
      'node_modules/added': [null, '1.0.0'],
      'node_modules/removed': ['1.0.0', null],
    };

    expect(hasDowngrade(changes)).toBe(false);
  });

  it('ignores changes where a version is not valid semver', () => {
    const changes = {
      'node_modules/tarball': ['1.0.0', 'https://example.com/pkg.tgz'],
      'node_modules/wildcard': ['*', '1.0.0'],
    };

    expect(hasDowngrade(changes)).toBe(false);
  });
});

describe('format', () => {
  const changes = {
    'node_modules/foo': ['1.0.0', '2.0.0'],
    'node_modules/bar': [null, '1.0.0'],
    'node_modules/baz': ['3.0.0', null],
  };

  it('returns empty string for empty changes with text format', () => {
    expect(format({}, { format: 'text' })).toBe('');
  });

  it('returns JSON string for json format', () => {
    const result = format(changes, { format: 'json' });
    expect(JSON.parse(result)).toEqual(changes);
  });

  it('returns text with arrows for text format', () => {
    const result = format(changes, { format: 'text', color: false });
    expect(result).toContain('node_modules/foo 1.0.0 -> 2.0.0');
    expect(result).toContain('node_modules/bar added');
    expect(result).toContain('node_modules/baz removed');
  });

  it('returns markdown table for markdown format', () => {
    const result = format(changes, { format: 'markdown' });
    expect(result).toContain('| Package');
    expect(result).toContain('node_modules/foo');
  });

  it('returns table for table format', () => {
    const result = format(changes, { format: 'table', title: '', color: false });
    expect(result).toContain('package');
    expect(result).toContain('node_modules/foo');
  });

  it('includes title in markdown format', () => {
    const result = format(changes, { format: 'markdown', title: 'package-lock.json' });
    expect(result).toContain('## package-lock.json');
  });

  it('defaults to text format', () => {
    const result = format(changes, { format: 'unknown', color: false });
    expect(result).toContain('node_modules/foo 1.0.0 -> 2.0.0');
  });
});
