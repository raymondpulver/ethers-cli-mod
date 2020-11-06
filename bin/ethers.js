#!/usr/bin/env node
'use strict';

const { BaseProvider } = require('@ethersproject/providers');
const { formatUnits } = require('@ethersproject/units');
const { Contract } = require('@ethersproject/contracts');
const { registerPlugin, Plugin, start } = require('../lib/mod');
const ethgasstation = require('../lib/ethgasstation');
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
    const getGasPrice = ethgasstation.EGSJsonRpcProvider.prototype.getGasPrice;
    BaseProvider.prototype.getGasPrice = getGasPrice;
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
  } 
  run() {
    cosnole.log('you can\'t run this plugin, it already has injected the runtime');
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
