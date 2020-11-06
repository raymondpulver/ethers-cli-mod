'use strict';

const {
  InfuraProvider,
  JsonRpcProvider,
  Web3Provider
} = require('@ethersproject/providers');

const axios = require('axios');
const { parseUnits } = require('@ethersproject/units');

const RETRY_TIMEOUT = 5000;

const cache = {};

const ETHGASSTATION_API_ENDPOINT = 'https://ethgasstation.info/api/ethgasAPI.json';

const levels = {
  safeLow: 0,
  average: 1,
  fast: 2,
  fastest: 3
};

const isLevel = (level) => typeof levels[level] === 'number';

const queryEthGasStation = async () => {
  const { data } = await axios.get(exports.ETHGASSTATION_API_ENDPOINT);
  return data;
};

const fetchMainnetGasPrice = async (level) => {
  level = level || 'fast';
  try {
    const data = await exports.queryEthGasStation();
    const result = data[level];
    const gasPrice = parseUnits(String(result), 8);
    cache[level] = gasPrice;
    return gasPrice;
  } catch (e) {
    if (process.env.DEBUG) console.error(e);
    if (!cache[level]) {
      console.warn('No gasPrice cached and http call failed .. retrying ' + ETHGASSTATION_API_ENDPOINT);
      await new Promise((resolve, reject) => setTimeout(resolve, RETRY_TIMEOUT));
      return await exports.fetchMainnetGasPrice(level);
    }
    return cache[level];
  }
};

const createGasPriceSubclass = (BaseClass) => class extends BaseClass {
  constructor(...args) {
    const back = args[args.length - 1];
    const suppliedLevel = isLevel(back);
    const superArgs = suppliedLevel ? args.slice(0, args.length - 1) : args;
    super(...superArgs);
    this.setGasPriceLevel(suppliedLevel ? back : 'fastest');
  }
  setGasPriceLevel(level) {
    this._level = level;
    return this;
  }
  getGasPriceLevel() {
    return this._level;
  }
  async getGasPrice() {
    return await exports.fetchMainnetGasPrice(this._level);
  }
}

const [
  EGSInfuraProvider,
  EGSWeb3Provider,
  EGSJsonRpcProvider
] = [
  InfuraProvider,
  Web3Provider,
  JsonRpcProvider
].map((v) => createGasPriceSubclass(v));

Object.assign(exports, {
  createGasPriceSubclass,
  fetchMainnetGasPrice,
  ETHGASSTATION_API_ENDPOINT,
  queryEthGasStation,
  EGSInfuraProvider,
  EGSWeb3Provider,
  EGSJsonRpcProvider
});
