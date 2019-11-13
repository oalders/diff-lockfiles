const chalk = require('chalk');
const semver = require('semver');
const { table } = require('table');

function diff(oldLock, newLock) {
  const changes = {};

  Object.entries(oldLock.dependencies).forEach(([name, { version }]) => {
    changes[name] = [version, null];
  });

  Object.entries(newLock.dependencies).forEach(([name, { version }]) => {
    if (changes[name]) {
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

  console.log(JSON.stringify(changes, null, 2));

  /* eslint-disable no-console */
}

function printText(changes) {
  /* eslint-disable no-console */

  Object.entries(changes).forEach(([name, [oldVersion, newVersion]]) => {
    if (!oldVersion) {
      console.log(`${name} ${chalk.red('removed')}`);
    } else if (!newVersion) {
      console.log(`${name} ${chalk.green('added')}`);
    } else if (!semver.eq(oldVersion, newVersion)) {
      const color = semver.gt(oldVersion, newVersion)
        ? chalk.red
        : chalk.green;

      console.log(`${name} ${color(`${oldVersion} -> ${newVersion}`)}`);
    }
  });

  /* eslint-enable no-console */
}

function printTable(changes) {
  /* eslint-disable no-console */

  const data = Object.entries(changes)
    .map(([name, [oldVersion, newVersion]]) => ([
      name,
      oldVersion,
      newVersion,
    ]))
    .map(([name, oldVersion, newVersion]) => {
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

  data.unshift([
    chalk.bold('package'),
    chalk.bold('old version'),
    chalk.bold('new version'),
  ]);

  console.log(table(data));

  /* eslint-disable no-console */
}

function print(changes, format) {
  switch (format) {
    case 'json':
      printJSON(changes);
      break;
    case 'table':
      printTable(changes);
      break;
    case 'text':
    default:
      printText(changes);
      break;
  }
}

module.exports = {
  diff,
  print,
};
