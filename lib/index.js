const chalk = require('chalk');
const semver = require('semver');
const { table } = require('table');

function diff(oldLock, newLock) {
  const changes = {};

  Object.entries(oldLock.packages).forEach(([name, { version }]) => {
    changes[name] = [version, null];
  });

  Object.entries(newLock.packages).forEach(([name, { version }]) => {
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

function printJSON(changes, options) {
  /* eslint-disable no-console */

  if (options.pretty) {
    console.log(JSON.stringify(changes, null, 2));
  } else {
    console.log(JSON.stringify(changes));
  }

  /* eslint-disable no-console */
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

  if (options.color) {
    data[0] = data[0].map((heading) => chalk.bold(heading));
  }

  console.log(table(data));

  /* eslint-disable no-console */
}

function print(changes, options) {
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

module.exports = {
  diff,
  print,
};
