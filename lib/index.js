// This is a fork of <https://github.com/mxweaver/lock-diff>
import chalk from 'chalk';
import semver from 'semver';
import { table } from 'table';
import { markdownTable } from 'markdown-table';

export function diff(oldLock, newLock, shallow) {
  // Keys come from untrusted lockfile contents; a null-prototype accumulator
  // keeps a package literally named `__proto__`/`constructor` a plain data key
  // instead of touching the prototype chain.
  const changes = Object.create(null);

  function filterPackages(packages) {
    // Tolerate a lockfile with no `packages` field (e.g. an npm v1 lockfile)
    // rather than throwing on Object.entries(undefined).
    let entries = Object.entries(packages ?? {});
    if (shallow) {
      const selfPackage = packages?.[''] ?? {};
      const directDeps = new Set(
          ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
              .flatMap(key => Object.keys(selfPackage[key] ?? {}))
              .map(pkg => `node_modules/${pkg}`));
      entries = entries.filter(([name]) => directDeps.has(name) || name === ''); // include self for compatibility
    }
    return entries;
  }

  filterPackages(oldLock.packages).forEach(([name, { version }]) => {
    changes[name] = [version, null];
  });

  filterPackages(newLock.packages).forEach(([name, { version }]) => {
    if (changes[name] && changes[name][0]) {
      if (semver.eq(changes[name][0], version)) {
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

function printJSON(changes) {
  console.log(JSON.stringify(changes));
}

function printText(changes, options) {

  if (options.title && options.title !== '') {
    console.log(options.title);
  }

  Object.entries(changes).forEach(([name, [oldVersion, newVersion]]) => {
    if (!oldVersion) {
      if (options.color) {
        console.log(`${name} ${chalk.green('added')}`);
      } else {
        console.log(`${name} added`);
      }
    } else if (!newVersion) {
      if (options.color) {
        console.log(`${name} ${chalk.red('removed')}`);
      } else {
        console.log(`${name} removed`);
      }
    } else if (!semver.eq(oldVersion, newVersion)) {
      if (options.color) {
        const color = semver.gt(oldVersion, newVersion)
          ? chalk.red
          : chalk.green;
        console.log(`${name} ${color(`${oldVersion} -> ${newVersion}`)}`);
      } else {
        console.log(`${name} ${oldVersion} -> ${newVersion}`);
      }
    }
  });

}

function printTable(changes, options) {

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

  console.log(table(data));

}

function printMarkdown(changes, options) {

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

  // Add title if provided
  if (options.title && options.title !== '') {
    console.log(`## ${options.title}\n`);
  }

  console.log(markdownTable(tableData));

}

export function print(changes, options) {
  switch (options.format) {
    case 'json':
      printJSON(changes, options);
      break;
    case 'table':
      printTable(changes, options);
      break;
    case 'markdown':
      printMarkdown(changes, options);
      break;
    case 'text':
    default:
      printText(changes, options);
      break;
  }
}
