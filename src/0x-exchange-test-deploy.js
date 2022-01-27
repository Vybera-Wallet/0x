'use strict'
const { createWeb3 } = require('./utils');
const TEST_CONFIG = require('./test_config.json');
const { abi: ABIEX } = require('../build/contracts/ExchangeZRX.json');

async function test(network) {
    const deployedAddress = TEST_CONFIG[network].deployedAddress;
    console.info('Check the deployed contract', deployedAddress);
    const web3 = createWeb3(network);
    const contract = new web3.eth.Contract(ABIEX, deployedAddress);
    const fee = await contract.methods.getFee().call();
    console.info('fee', fee);
    const zrx = await contract.methods.getSwapTarget().call();
    console.info('0x Target', zrx);
    const owner = await contract.methods.owner().call();
    console.info('owner', owner);
}

let network = process.argv.slice(2)[0];

async function runTest(network) {
    await test(network);
}

runTest(network).then(() => { process.exit(0); });


