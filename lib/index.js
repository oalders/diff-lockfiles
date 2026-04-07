// This is a fork of <https://github.com/mxweaver/lock-diff>
import chalk from 'chalk';
import semver from 'semver';
import { table } from 'table';
import { markdownTable } from 'markdown-table';

export function diff(oldLock, newLock, shallow) {
  // Fail loudly on a lockfile with no top-level `packages` map (e.g. a legacy
  // npm v1 lockfile, which records tree state under `dependencies` instead).
  // Silently returning an empty diff would be fail-open: a downgrade could then
  // slip past `--fail-on-downgrade`. An *empty* `packages` object is different
  // and allowed — that is how an added or removed lockfile is modelled.
  if (oldLock?.packages == null || newLock?.packages == null) {
    throw new Error(
        'Cannot diff a lockfile with no top-level "packages" map ' +
        '(npm lockfileVersion 2 or greater is required).');
  }

  // Keys come from untrusted lockfile contents. A null-prototype accumulator
  // means a package literally named `__proto__` becomes an ordinary data key
  // (and appears in Object.keys) instead of being swallowed by the prototype
  // setter that a plain `{}` would invoke for that name.
  const changes = Object.create(null);

  function filterPackages(packages) {
    let entries = Object.entries(packages);
    if (shallow) {
      const selfPackage = packages[''] ?? {};
      const directDeps = new Set(
          ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
              .flatMap(key => Object.keys(selfPackage[key] ?? {}))
              .map(pkg => `node_modules/${pkg}`));
      entries = entries.filter(([name]) => directDeps.has(name) || name === ''); // include self for compatibility
    }
    return entries;
  }

  filterPackages(oldLock.packages).forEach(([name, entry]) => {
    changes[name] = [entry?.version ?? null, null];
  });

  filterPackages(newLock.packages).forEach(([name, entry]) => {
    const version = entry?.version ?? null;
    if (changes[name] && changes[name][0]) {
      // Only compare when the new side actually carries a version; comparing
      // against null would throw in semver and a versionless new entry is
      // better treated as a removal below.
      if (version !== null && semver.eq(changes[name][0], version)) {
        delete changes[name];
      } else {
        changes[name] = [changes[name][0], version];
      }
    } else {
      changes[name] = [null, version];
    }
  });

  return changes;
}

export function hasDowngrade(changes) {
  return Object.values(changes).some(([oldVersion, newVersion]) =>
    semver.valid(oldVersion) &&
    semver.valid(newVersion) &&
    semver.gt(oldVersion, newVersion));
}


function formatJSON(changes) {
  return JSON.stringify(changes);
}

function formatText(changes, options) {
  const lines = [];

  if (options.title && options.title !== '') {
    lines.push(options.title);
  }

  Object.entries(changes).forEach(([name, [oldVersion, newVersion]]) => {
    if (!oldVersion) {
      if (options.color) {
        lines.push(`${name} ${chalk.green('added')}`);
      } else {
        lines.push(`${name} added`);
      }
    } else if (!newVersion) {
      if (options.color) {
        lines.push(`${name} ${chalk.red('removed')}`);
      } else {
        lines.push(`${name} removed`);
      }
    } else if (!semver.eq(oldVersion, newVersion)) {
      if (options.color) {
        const color = semver.gt(oldVersion, newVersion)
          ? chalk.red
          : chalk.green;
        lines.push(`${name} ${color(`${oldVersion} -> ${newVersion}`)}`);
      } else {
        lines.push(`${name} ${oldVersion} -> ${newVersion}`);
      }
    }
  });

  return lines.join('\n');
}

function formatTable(changes, options) {
  let data = Object.entries(changes)
    .map(([name, [oldVersion, newVersion]]) => ([
      name,
      oldVersion,
      newVersion,
    ]));

  if (options.color) {
    data = data.map(([name, oldVersion, newVersion]) => {
      if (semver.valid(oldVersion) && semver.valid(newVersion)) {
        if (semver.lt(oldVersion, newVersion)) {
          oldVersion = chalk.red(oldVersion);
          newVersion = chalk.green(newVersion);
        } else if (semver.gt(oldVersion, newVersion)) {
          oldVersion = chalk.green(oldVersion);
          newVersion = chalk.red(newVersion);
        }
      }

      return [name, oldVersion, newVersion];
    });
  }

  data.unshift(['package', 'old version', 'new version']);
  if (options.title !== '') {
    data.unshift([options.title, '', '']);
  }

  if (options.color) {
    data[0] = data[0].map((heading) => chalk.bold(heading));
  }

  return table(data);
}

function formatMarkdown(changes, options) {
  // Helper function to format version changes with markdown emphasis
  function formatVersionChange(oldVersion, newVersion) {
    if (!oldVersion) return `**${newVersion}** (added)`;
    if (!newVersion) return `~~${oldVersion}~~ (removed)`;

    if (semver.valid(oldVersion) && semver.valid(newVersion)) {
      if (semver.lt(oldVersion, newVersion)) {
        return `${oldVersion} → **${newVersion}**`;
      } else if (semver.gt(oldVersion, newVersion)) {
        return `**${oldVersion}** → ${newVersion}`;
      }
    }

    return `${oldVersion} → ${newVersion}`;
  }

  const tableData = [
    ['Package', 'Old Version', 'New Version', 'Change'],
    ...Object.entries(changes).map(([name, [oldVersion, newVersion]]) => [
      name,
      oldVersion || '—',
      newVersion || '—',
      formatVersionChange(oldVersion, newVersion)
    ])
  ];

  const parts = [];

  // Add title if provided
  if (options.title && options.title !== '') {
    parts.push(`## ${options.title}\n`);
  }

  parts.push(markdownTable(tableData));

  return parts.join('\n');
}

export function format(changes, options) {
  switch (options.format) {
    case 'json':
      return formatJSON(changes, options);
    case 'table':
      return formatTable(changes, options);
    case 'markdown':
      return formatMarkdown(changes, options);
    case 'text':
    default:
      return formatText(changes, options);
  }
}

export function print(changes, options) {
  const output = format(changes, options);
  if (output) {
    console.log(output);
  }
}
