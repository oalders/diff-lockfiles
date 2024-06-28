// This is a fork of <https://github.com/mxweaver/lock-diff>
import chalk from 'chalk';
import semver from 'semver';
import { table } from 'table';

export function diff(oldLock, newLock, shallow) {
  const changes = {};
  
  function filterPackages(packages) {
    let entries = Object.entries(packages);
    if (shallow) {
      const selfPackage = packages[''];
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

function printJSON(changes) {
  /* eslint-disable no-console */
  console.log(JSON.stringify(changes));
}

function printText(changes, options) {
  /* eslint-disable no-console */

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

  /* eslint-enable no-console */
}

function printTable(changes, options) {
  /* eslint-disable no-console */

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

  /* eslint-disable no-console */
}

export function print(changes, options) {
  switch (options.format) {
    case 'json':
      printJSON(changes, options);
      break;
    case 'table':
      printTable(changes, options);
      break;
    case 'text':
    default:
      printText(changes, options);
      break;
  }
}
