'use strict';

const { Plugin, CLI } = require('@ethersproject/cli/lib/cli');

const { addPlugin } = CLI.prototype;

CLI.prototype.addPlugin = function (...args) {
  const result = addPlugin.apply(this, args);
  const [ _, Plugin ] = args;
  if (Plugin.bootstrap) Plugin.bootstrap(this);
  return result;
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
    require('@ethersproject/cli/lib/bin/ethers');
  }
});
