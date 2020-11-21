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

class TransferPlugin extends Plugin {
  static getHelp() {
    return {
      name: 'transfer',
      help: 'ERC20 transfer a token'
    };
  }
  async _getAmount() {
    return ethers.utils.parseUnits(this.amount, await this.contract.decimals());
  }
  prepareArgs(args) {
    const [ token, target, amount ] = args;
    this.target = target;
    this.amount = amount;
    this.contract = new ethers.Contract(token, Erc20Abi, this.accounts[0]);
  }
  async run() {
    await this.contract.transfer(this.target, await this._getAmount());
  }
}

class MintPlugin extends TransferPlugin {
  static getHelp() {
    return {
      name: 'mint',
      help: 'mint a test token'
    };
  }
  prepareArgs(args) {
    const [ token, target, amount ] = args;
    this.target = target;
    this.amount = amount;
    this.contract = new ethers.Contract(token, Erc20Abi, this.accounts[0]);
  }
  async run() {
    await this.contract.mint(this.target, this._getAmount());
  }
}

class ApprovePlugin extends TransferPlugin {
  static getHelp() {
    return {
      name: 'approve',
      help: 'ERC20 approve a token'
    };
  }
  prepareArgs(args) {
    const [ token, from, target, amount ] = args;
    this.from = from;
    this.contract = new ethers.Contract(token, Erc20Abi, this.accounts[0]);
  }
  async run() {
    await this.contract.approve(this.from, this.target, await this._getAmount());
  }
}

const checkFlag = (flag) => {
  return Boolean(process.argv.find((v) => v === flag));
};

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
    const addressPath = path.join(process.env.HOME, '.address-book.json');
    if (fs.existsSync(addressPath)) {
      addressBook = require(addressPath);
    }
    BaseProvider.prototype.resolveName = async function (name) {
      if (addressBook[name]) return addressBook[name];
      return await resolveName.call(this, name);
    };
    const { consumeMultiOptions } = ArgParser.prototype;
    ArgParser.prototype.consumeMultiOptions = function (...args) {
      this._insertEnvironment();
      return consumeMultiOptions.apply(this, args);
    };
    ArgParser.prototype._insertEnvironment = function () {
      const additions = Object.keys(process.env).filter((v) => v.match(/^ETHERS\_/)).map((v) => ({
        name: v,
        value: process.env[v]
      })).map((v) => ({
          value: v.value,
          name: v.name.split('_').slice(1).map((v) => v.toLowerCase()).join('-')
      })).filter((v) => !this._args.find((u) => u.match(v.name)));
      additions.forEach((v) => { this._args.push('--' + v.name); this._args.push((v.value)); });
    }

    Signer.prototype._sendTransaction = Signer.prototype.sendTransaction;
    if (checkFlag('--redispatch')) Signer.prototype.sendTransaction = async function (...args) {
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
        const { getGasPrice: getGasPriceOriginal } = BaseProvider.prototype;
        this._seen = {};
        this._redispatch.on('tx:dispatch', (tx) => {
          if (this._seen[Number(tx.nonce)]) {
            console.log('Redispatch:')
            console.log('  Gas Price: ' + formatUnits(tx.gasPrice, 9) + ' gwei');
            console.log('  Hash: ' + tx.hash);
          }
        });
        this._redispatch.startWatching();
      }
      const tx = await this._redispatch.sendTransaction(...args);
      this._seen[Number(tx.nonce)] = true;
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
  'function transfer(address, uint256) returns (bool)',
  'function approve(address, address, uint256) returns (bool)',
  'function mint(address, uint256)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)'
];

class DecimalsPlugin extends Plugin {
  static getHelp() {
    return {
      name: 'decimals',
      help: 'get decimal precision for token'
    };
  }
  prepareArgs(args) {
    this.contract = new ethers.Contract(args[0], Erc20Abi, this.provider);
  }
  async run() {
    console.log(String(await this.contract.decimals()));
  }
}

class TotalSupplyPlugin extends DecimalsPlugin {
  static getHelp() {
    return {
      name: 'total-supply',
      help: 'get total supply of token'
    }
  }
  prepareArgs(args) {
    this.contract = new ethers.Contract(args[0], Erc20Abi, this.provider);
  }
  async run() {
    console.log(ethers.utils.formatUnits(await this.contract.totalSupply(), await this.contract.decimals()));
  }
}



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

class ExportKeyPlugin extends Plugin {
  static getHelp() {
    return {
      name: 'export',
      help: 'Exports a private key'
    };
  }
  async run() {
    await this.accounts[0].unlock();
      console.log(this.accounts[0]);
    console.log('0x' + this.accounts[0]._privKey.toString(16));
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
registerPlugin('export-key', ExportKeyPlugin);
registerPlugin('transfer', TransferPlugin);
registerPlugin('mint', MintPlugin);
registerPlugin('approve', ApprovePlugin);
registerPlugin('total-supply', TotalSupplyPlugin);
registerPlugin('decimals', DecimalsPlugin);

start();
