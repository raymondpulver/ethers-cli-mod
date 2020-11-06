#!/usr/bin/env node
'use strict';

const { BaseProvider } = require('@ethersproject/providers');
const { formatUnits } = require('@ethersproject/units');
const { Contract } = require('@ethersproject/contracts');
const { registerPlugin, Plugin, start, ArgParser } = require('../lib/mod');
const gasnow = require('ethers-gasnow');
const ethers = require('ethers');
const { RedispatchSigner } = require('ethers-redispatch-signer');
const fs = require('fs');
const path = require('path');

class RuntimePlugin extends Plugin {
  static getHelp() {
    return {
      name: 'runtime-plugin',
      help: 'Runtime has been injected! Thanks.'
    };
  }
  static bootstrap(cli) {
    BaseProvider.prototype.getGasPrice = gasnow.createGetGasPrice('rapid');
    const resolveName = BaseProvider.prototype.resolveName;
    let addressBook = {};
    if (fs.existsSync(path.join(process.cwd(), 'addresses.txt'))) {
      addressBook = fs.readFileSync(path.join(process.cwd(), 'addresses.txt'), 'utf8').split('\n').filter(Boolean).map((v) => v.split(/\s+/g)).reduce((r, v) => {
       r[v[0]] = v[1];
       return r;
      }, {});
    }
    BaseProvider.prototype.resolveName = async function (name) {
      if (addressBook[name]) return addressBook[name];
      return await resolveName.call(this, name);
    };
    const plugin = new Plugin();
    const argParser = new ArgParser([]);
    argParser.consumeMultiOptions = () => {
      return [{
        name: 'account-rpc',
        value: '0'
      }];
    };
    const consumeOptions = argParser.consumeOptions;
    argParser.consumeOptions = function (...args) {
      if (args[0] === 'rpc') {
        return [ 'http://localhost:8545' ];
      }
      return consumeOptions.apply(this, args);
    };
    plugin.prepareOptions(argParser);
    const WrappedSigner = plugin.accounts[0].constructor;
    const sendTransaction = WrappedSigner.prototype.sendTransaction;
    const defineReadOnly = ethers.utils.defineReadOnly;
    WrappedSigner.prototype.sendTransaction = async function (...args) {
      return await this._redispatch.sendTranscation(...args);
    };
    ethers.utils.defineReadOnly = function (...args) {
      const [ instance ] = args;
      if (instance instanceof WrappedSigner) {
        instance._redispatch = this._redispatch || new RedispatchSigner(Object.assign(Object.create(instance), {
          sendTransaction(...args) {
            return sendTransaction.apply(this, args);
          }
        }));
      }
      defineReadOnly.apply(this, args);
    };
  } 
  run() {
    console.log('you can\'t run this plugin, it already has injected the runtime');
  }
}

const Erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

class BalanceOfPlugin extends Plugin {
  static getHelp() {
    return {
      name: 'balance-of-token',
      help: 'Get the balance of an address'
    };
  }
  prepareArgs(args) {
    const [ token, user ] = args;
    this.token = token;
    this.user = user;
  }
  async run() {
    const contract = new Contract(this.token, Erc20Abi, this.provider);
    const decimals = Number(await contract.decimals());  
    console.log(formatUnits((await contract.balanceOf(this.user || this.accounts[0].getAddress())).toHexString(), decimals));
    process.exit(0);
  }
}

registerPlugin('runtime-plugin', RuntimePlugin);
registerPlugin('balance-of-token', BalanceOfPlugin)

start();
