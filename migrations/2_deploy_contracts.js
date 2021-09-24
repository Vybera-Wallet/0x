const fs = require('fs');
const path = require('path');

const ExchangeZRX = artifacts.require('ExchangeZRX');
const DEPLOY_CONFIG = require('./deploy_config.json');
const TEST_CONFIG = require('../src/test_config.json');

const usd = (n) => web3.utils.toWei(n, 'Mwei');
const ether = (n) => web3.utils.toWei(n, 'ether');

module.exports = function (deployer, network) {
  deployer.then(async () => {
    if (network === 'test' || network === 'develop') {
      console.log(`deploy ExchangeZRX in develop with fee:${DEPLOY_CONFIG[network].exchangeFee / 100}%`);
      await deployer.deploy(ExchangeZRX, DEPLOY_CONFIG[network].exchangeFee, "0xdef1c0ded9bec7f1a1670819833240f027b25eff", "0x0000000000000000000000000000000000000000");
      const exchangeZRX = await ExchangeZRX.deployed();
    }
    else if (network === 'ropsten' || network === 'bscTestnet' || network === 'polygonMumbai') {
      console.log(`Deploy ExchangeZRX in ${network} with fee:${DEPLOY_CONFIG[network].exchangeFee / 100}%`);
      await deployer.deploy(ExchangeZRX, DEPLOY_CONFIG[network].exchangeFee, DEPLOY_CONFIG[network].swapTarget, DEPLOY_CONFIG[network].wrappedToken);
      const exchangeZRX = await ExchangeZRX.deployed();
      // Update the deployed address in test config.
      TEST_CONFIG[network].deployedAddress = exchangeZRX.address;
      fs.writeFileSync(
        path.resolve(__dirname, '../src/test_config.json'),
        JSON.stringify(TEST_CONFIG, null, '    '),
      );
    }
    else if (network === 'mainnet' || network === 'bsc' || network === 'polygon') {
      console.log(`Deploy ExchangeZRX in ${network} with fee:${DEPLOY_CONFIG[network].exchangeFee / 100}%`);
      await deployer.deploy(ExchangeZRX, DEPLOY_CONFIG[network].exchangeFee, DEPLOY_CONFIG[network].swapTarget, DEPLOY_CONFIG[network].wrappedToken);
    }
    else {
      console.log('unsupported network', network);
    }
  });
};
