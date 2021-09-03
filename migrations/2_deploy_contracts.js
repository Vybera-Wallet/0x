const fs = require('fs');
const path = require('path');

const ExchangeZRX = artifacts.require('ExchangeZRX');
const PACKAGE_CONFIG = require('../src/test_config.json');

const usd = (n) => web3.utils.toWei(n, 'Mwei');
const ether = (n) => web3.utils.toWei(n, 'ether');

module.exports = function (deployer, network) {
  deployer.then(async () => {
    if (network === 'test' || network === 'soliditycoverage' || network === 'develop') {
      await deployer.deploy(ExchangeZRX, PACKAGE_CONFIG.tokenFee);
      const exchangeZRX = await ExchangeZRX.deployed();
    } else if (network === 'ropsten') {
      await deployer.deploy(ExchangeZRX, PACKAGE_CONFIG.tokenFee);
      const exchangeZRX = await ExchangeZRX.deployed();
      // Update the deployed address in package.json.
      PACKAGE_CONFIG.deployedAddress = exchangeZRX.address;
      fs.writeFileSync(
        path.resolve(__dirname, '../src/test_config.json'),
        JSON.stringify(PACKAGE_CONFIG, null, '    '),
      );
    } else if (network === 'mainnet') {

    } else {
      console.log('unsupported network', network);
    }
  });
};
