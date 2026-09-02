import { diff, hasDowngrade } from '../lib/index.js';

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
