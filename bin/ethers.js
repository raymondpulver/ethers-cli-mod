#!/usr/bin/env node
'use strict';

const { BaseProvider } = require('@ethersproject/providers');
const { parseUnits, formatUnits } = require('@ethersproject/units');
const { Contract } = require('@ethersproject/contracts');
const { Signer } = require('@ethersproject/abstract-signer');
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
  static async bootstrap(cli) {
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
    Signer.prototype._sendTransaction = Signer.prototype.sendTransaction;
    Signer.prototype.sendTransaction = async function (...args) {
      const [ txObject ] = args;
      delete txObject.from;
      if (this.persistence) {
        return await this._sendTransaction(...args);
      }
      if (!this._redispatch) {
        this._redispatch = new RedispatchSigner(new Proxy(this, {
          get: (o, prop) => {
            if (prop === 'persistence') return {};
            return o[prop];
          }
        }));
/*
        const { getGasPrice: getGasPriceOriginal } = BaseProvider.prototype;
        BaseProvider.prototype.getGasPrice = async function () {
          const result = await getGasPriceOriginal.apply(this, []);
          return result;
        };
*/
        this._redispatch.on('tx:dispatch', (tx) => {
          console.log('Redispatch:')
          console.log('  Gas Price: ' + formatUnits(tx.gasPrice, 9) + ' gwei');
          console.log('  Hash: ' + tx.hash);
        });
        this._redispatch.startWatching();
      }
      const tx = await this._redispatch.sendTransaction(...args);
      return tx;
    };
    if (process.env.DEBUG_GASPRICE) {
      const { getGasPrice } = BaseProvider.prototype;
      BaseProvider.prototype.getGasPrice = async function () {
        const result = (this._last || parseUnits('15', 9)).add(parseUnits('1', 9));
        this._last = result;
        return result;
      };
    }
  } 
  run() {
    console.log('you can\'t run this plugin, it already has injected the runtime');
  }
}

const Erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

class EtherBalanceOfPlugin extends Plugin {
  static getHelp() {
    return {
      name: 'balance-of',
      help: 'Get the ether balance in an address'
    };
  }
  async prepareArgs(args) {
    const [ user ] = args;
    this.user = user;
  }
  async run() {
    console.log(ethers.utils.formatEther(await this.provider.getBalance(this.user || await this.accounts[0].getAddress())));
    process.exit(0);
  }
}

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
registerPlugin('balance-of', EtherBalanceOfPlugin);

start();
