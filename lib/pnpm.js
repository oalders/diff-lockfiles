import semver from 'semver';
import YAML from 'yaml';
import { diff } from './index.js';

// `contents` is null when the lockfile does not exist at a ref (added/removed),
// which diffs as all-added or all-removed, like the npm path.
export function parsePnpmLock(contents, filename) {
  if (contents === null) {
    return { importers: {}, packages: {} };
  }
  let lock;
  try {
    lock = YAML.parse(contents);
  } catch (err) {
    const reason = err.code === 'MULTIPLE_DOCS' ? 'multiple YAML documents are not supported' : err.message;
    throw new Error(`Could not parse ${filename} as YAML: ${reason}`, { cause: err });
  }
  // Fail closed on any other format version: older and future layouts differ,
  // and misreading one as empty would let a downgrade slip past the gate.
  const lockfileVersion = lock?.lockfileVersion;
  if (Math.trunc(parseFloat(String(lockfileVersion))) !== 9) {
    throw new Error(`Cannot diff ${filename}: pnpm lockfileVersion ${lockfileVersion} is not supported (9.x is required).`);
  }
  return { importers: lock.importers ?? {}, packages: lock.packages ?? {} };
}

// Semver versions highest first, then any non-semver values (by string).
function descending(a, b) {
  if (semver.valid(a) && semver.valid(b)) {
    return semver.rcompare(a, b);
  }
  if (semver.valid(a) || semver.valid(b)) {
    return semver.valid(a) ? -1 : 1;
  }
  return a < b ? 1 : a > b ? -1 : 0;
}

// `packages` keys are `name@version`; split at the first `@` after a scope's
// leading one, since versions such as `git+ssh://git@…` can contain `@` too.
function versionsByName(packages) {
  const byName = Object.create(null);
  for (const [key, entry] of Object.entries(packages)) {
    const at = key.indexOf('@', 1);
    if (at === -1) {
      throw new Error(`Cannot diff pnpm package key without a version: ${key}`);
    }
    // git/tarball entries carry their real version in the entry, not the key.
    const version = String(entry?.version ?? key.slice(at + 1));
    (byName[key.slice(0, at)] ??= new Set()).add(version);
  }
  return byName;
}

// Importer versions may carry a peer suffix (`18.2.0(react@18.2.0)`) and, for
// an alias, the target's `name@` prefix; strip both to get the bare version.
function importerVersion(version) {
  return version == null
    ? null
    : String(version).replace(/\(.*$/, '').replace(/^(@[^/@]+\/)?[^/@:]+@/, '');
}

// Direct dependencies of each workspace importer, keyed like npm's lockfile
// (`node_modules/foo`, `packages/a/node_modules/foo`) so diff() can compare them.
function importerPackages(importers) {
  const packages = Object.create(null);
  for (const [path, importer] of Object.entries(importers)) {
    const prefix = path === '.' ? '' : `${path}/`;
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const [name, dep] of Object.entries(importer?.[field] ?? {})) {
        packages[`${prefix}node_modules/${name}`] = { version: importerVersion(dep?.version) };
      }
    }
  }
  return { packages };
}

export function diffPnpm(oldLock, newLock, shallow) {
  if (shallow) {
    return diff(importerPackages(oldLock.importers), importerPackages(newLock.importers), false);
  }

  const oldVersions = versionsByName(oldLock.packages);
  const newVersions = versionsByName(newLock.packages);
  const changes = Object.create(null);

  for (const name of new Set([...Object.keys(oldVersions), ...Object.keys(newVersions)])) {
    const before = oldVersions[name] ?? new Set();
    const after = newVersions[name] ?? new Set();
    // Pair highest removed with highest added, and so on down; leftovers are
    // plain adds/removes. So a downgrade is flagged iff the top version drops.
    const removed = [...before].filter((v) => !after.has(v)).sort(descending);
    const added = [...after].filter((v) => !before.has(v)).sort(descending);
    const rows = Math.max(removed.length, added.length);
    for (let i = 0; i < rows; i++) {
      const pair = [removed[i] ?? null, added[i] ?? null];
      changes[rows === 1 ? name : `${name}@${pair[0] ?? pair[1]}`] = pair;
    }
  }

  return changes;
}
