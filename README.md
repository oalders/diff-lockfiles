# lock-diff

![npm](https://img.shields.io/npm/v/lock-diff)
[![airbnb-style](https://img.shields.io/badge/style-airbnb-blue.svg)](https://github.com/airbnb/javascript)

## Usage

```
Usage: diff [options] <oldPath> <newPath>

Options:
  -V, --version          output the version number
  -f, --format <format>  changes the output format (default: "text")
  -h, --help             output usage information
```

## Examples

### `--format=text` (default)

```
> lock-diff data/lodash.4-17-11.package-lock.json data/lodash.4-17-15.package-lock.json 
ajv 5.5.2 -> 6.10.2
async 2.6.0 -> 2.6.3
chokidar 1.6.1 -> 1.7.0
co added
dojo 1.13.0 -> 1.15.0
ecstatic 2.2.1 -> 2.2.2
fast-deep-equal 1.1.0 -> 2.0.1
fill-range 2.2.3 -> 2.2.4
glob 7.1.2 -> 7.1.4
handlebars 4.0.11 -> 4.1.2
he 1.1.1 -> 1.2.0
jquery 3.3.1 -> 3.4.1
js-yaml 3.6.1 -> 3.13.1
json-schema-traverse 0.3.1 -> 0.4.1
lodash 4.17.3 -> 4.17.14
lodash.merge 4.6.1 -> 4.6.2
mime 1.2.11 -> 1.6.0
randomatic 1.1.7 -> 3.1.1
request 2.85.0 -> 2.88.0
requirejs 2.3.5 -> 2.3.6
stringstream added
chownr removed
deep-extend removed
fs-minipass removed
math-random removed
minipass removed
minizlib removed
neo-async removed
psl removed
rc removed
tar removed
uri-js removed

```

### `--format=json`

```
> lock-diff data/lodash.4-17-11.package-lock.json data/lodash.4-17-15.package-lock.json --format=json
{
  "ajv": [
    "5.5.2",
    "6.10.2"
  ],
  "async": [
    "2.6.0",
    "2.6.3"
  ],
  "chokidar": [
    "1.6.1",
    "1.7.0"
  ],
  "co": [
    "4.6.0",
    null
  ],
  "dojo": [
    "1.13.0",
    "1.15.0"
  ],
  "ecstatic": [
    "2.2.1",
    "2.2.2"
  ],
  "fast-deep-equal": [
    "1.1.0",
    "2.0.1"
  ],
  "fill-range": [
    "2.2.3",
    "2.2.4"
  ],
  "glob": [
    "7.1.2",
    "7.1.4"
  ],
  "handlebars": [
    "4.0.11",
    "4.1.2"
  ],
  "he": [
    "1.1.1",
    "1.2.0"
  ],
  "jquery": [
    "3.3.1",
    "3.4.1"
  ],
  "js-yaml": [
    "3.6.1",
    "3.13.1"
  ],
  "json-schema-traverse": [
    "0.3.1",
    "0.4.1"
  ],
  "lodash": [
    "4.17.3",
    "4.17.14"
  ],
  "lodash.merge": [
    "4.6.1",
    "4.6.2"
  ],
  "mime": [
    "1.2.11",
    "1.6.0"
  ],
  "randomatic": [
    "1.1.7",
    "3.1.1"
  ],
  "request": [
    "2.85.0",
    "2.88.0"
  ],
  "requirejs": [
    "2.3.5",
    "2.3.6"
  ],
  "stringstream": [
    "0.0.5",
    null
  ],
  "chownr": [
    null,
    "1.1.2"
  ],
  "deep-extend": [
    null,
    "0.6.0"
  ],
  "fs-minipass": [
    null,
    "1.2.6"
  ],
  "math-random": [
    null,
    "1.0.4"
  ],
  "minipass": [
    null,
    "2.3.5"
  ],
  "minizlib": [
    null,
    "1.2.1"
  ],
  "neo-async": [
    null,
    "2.6.1"
  ],
  "psl": [
    null,
    "1.2.0"
  ],
  "rc": [
    null,
    "1.2.8"
  ],
  "tar": [
    null,
    "4.4.10"
  ],
  "uri-js": [
    null,
    "4.2.2"
  ]
}

```