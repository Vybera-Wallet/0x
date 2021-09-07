const fs = require('fs');
const path = require('path');

const ExchangeZRX = artifacts.require('ExchangeZRX');
const PACKAGE_CONFIG = require('../src/test_config.json');

const usd = (n) => web3.utils.toWei(n, 'Mwei');
const ether = (n) => web3.utils.toWei(n, 'ether');

module.exports = function (deployer, network) {
  deployer.then(async () => {
    if (network === 'test' || network === 'soliditycoverage' || network === 'develop') {
      console.log(`deploy ExchangeZRX in develop with fee:${PACKAGE_CONFIG.tokenFee / 100}%`);
      await deployer.deploy(ExchangeZRX, PACKAGE_CONFIG.tokenFee, '0xdef1c0ded9bec7f1a1670819833240f027b25eff');
      const exchangeZRX = await ExchangeZRX.deployed();
    }
    else if (network === 'ropsten') {
      console.log(`deploy ExchangeZRX in ropsten with fee:${PACKAGE_CONFIG.tokenFee / 100}%`);
      await deployer.deploy(ExchangeZRX, PACKAGE_CONFIG.tokenFee, '0xdef1c0ded9bec7f1a1670819833240f027b25eff');
      const exchangeZRX = await ExchangeZRX.deployed();
      // Update the deployed address in package.json.
      PACKAGE_CONFIG.deployedAddress = exchangeZRX.address;
      fs.writeFileSync(
        path.resolve(__dirname, '../src/test_config.json'),
        JSON.stringify(PACKAGE_CONFIG, null, '    '),
      );
    }
    else if (network === 'mainnet') {
      console.log(`deploy ExchangeZRX in mainnet with fee:${PACKAGE_CONFIG.tokenFee / 100}%`);
      await deployer.deploy(ExchangeZRX, PACKAGE_CONFIG.tokenFee, '0xdef1c0ded9bec7f1a1670819833240f027b25eff');
    }
    else if (network === 'bsc') {
      console.log(`deploy ExchangeZRX in bsc mainnet with fee:${PACKAGE_CONFIG.tokenFee / 100}%`);
      await deployer.deploy(ExchangeZRX, PACKAGE_CONFIG.tokenFee, '0xdef1c0ded9bec7f1a1670819833240f027b25eff');
    }
    else if (network === 'polygon') {
      console.log(`deploy ExchangeZRX in polygon mainnet with fee:${PACKAGE_CONFIG.tokenFee / 100}%`);
      await deployer.deploy(ExchangeZRX, PACKAGE_CONFIG.tokenFee, '0xdef1c0ded9bec7f1a1670819833240f027b25eff');
    }
    else {
      console.log('unsupported network', network);
    }
  });
};
