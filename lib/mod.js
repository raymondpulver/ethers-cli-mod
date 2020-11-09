'use strict';

const { Plugin, CLI, ArgParser } = require('@ethersproject/cli/lib/cli');
const { addPlugin } = CLI.prototype;

CLI.prototype.addPlugin = function (...args) {
  const result = addPlugin.apply(this, args);
  const [ _, Plugin ] = args;
  if (Plugin.bootstrap) Plugin.bootstrap(this);
  return result;
};

const { run } = CLI.prototype;

CLI.prototype.run = async function (...args) {
  const result = await run.apply(this, args);
  process.exit(0);
};

Object.assign(exports, {
  Plugin,
  CLI,
  registerPlugin: (name, plugin) => {
    const run = CLI.prototype.run;
    CLI.prototype.run = async function (...args) {
      this.addPlugin(name, plugin);
      return await run.apply(this, args);
    };
  },
  start() {
    process.on('unhandledRejection', (err) => {
      console.error(err);
      process.exit(1);
    });
    require('@ethersproject/cli/lib/bin/ethers');
  },
  ArgParser
});
