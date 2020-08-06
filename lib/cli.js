'use strict';

const meow = require('meow');
const inlineImports = require('./inline-imports');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');
const walkSync = require('walk-sync');

const cli = meow(require('./help-output'), {
  flags: {
    output: {
      type: 'string',
      alias: 'o'
    },
    'output-dir': {
      type: 'string',
      alias: 'd'
    }
  }
});

if ('output' in cli.flags && 'outputDir' in cli.flags) {
  throw new Error('Cannot have both --output and --output-dir specified');
}

function processFile(input) {
  const filename = path.resolve(input);
  const basedir = path.dirname(filename)
  const content = fs.readFileSync(filename, 'UTF8');

  return inlineImports(content, { basedir });
}

if (cli.input.length === 0) {
  console.log(cli.help);
  process.exitCode = 1;
} else if (cli.input.length === 1) {
  const input = cli.input[0]
  const entry = fs.statSync(input);
  // handle scenario, were we walk an entire directory which may contain
  // graphql files, and produce a new directory with all found graphql files
  // but with their imports inlined.
  if (entry.isDirectory()) {
    if (!('outputDir' in cli.flags)) {
      throw new Error('When providing a directory of inputs, you must specify --output-dir');
    }

    const queryFiles = walkSync(input).filter(file => {
      // don't use globs, since we must traverse all files anyways,
      // globs are only really useful when they can limit the directories we
      // traverse.
      //
      // Otherwise, grab on the files and perform filtering efficiently as follows
      return file.charAt(0) !== '_' && file.endsWith('.graphql')
    });

    for (const queryFile of queryFiles) {
      const outputFileName = `${cli.flags.outputDir}/${queryFile}`;
      const inputFileName = `${cli.input}/${queryFile}`;
      const dirname = path.dirname(outputFileName);
      const content = processFile(inputFileName);

      console.log(`  [processed] ${queryFile} -> ${outputFileName}`);
      try {
        // mkdirp is slow, let's assume the dir exists. If it does not, we
        // "just in time" create it. This works well, based on that typically
        // their are way more files then new directories
        fs.writeFileSync(outputFileName, content);
      } catch(e) {
        if (typeof e === 'object' && e !== null & e.code === 'ENOENT') {
          mkdirp.sync(dirname);
          fs.writeFileSync(outputFileName, content);
        } else {
          throw e;
        }
      }
    }
  } else {
    if ('outputDir' in cli.flags) {
      throw new Error('When providing an input file, you must specify --output or consume the result via stdout.');
    }

    const output = processFile(input);
    if (cli.flags.output) {
      fs.writeFileSync(cli.flags.output, output);
    } else {
      console.log(output);
    }
  }

} else {
  throw new Error(`invalid number of inputs, expected '1' but got '${cli.input.length}' `);
}