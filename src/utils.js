'use strict'
const HDWalletProvider = require('@truffle/hdwallet-provider');
const BigNumber = require('bignumber.js');
const process = require('process');
const Web3 = require('web3');

const config = require('../truffle-config-template.js');

function createQueryString(params) {
    return Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
}

// Wait for a web3 tx `send()` call to be mined and return the receipt.
function waitForTxSuccess(tx) {
    return new Promise((accept, reject) => {
        try {
            tx.on('error', err => reject(err));
            tx.on('receipt', receipt => accept(receipt));
        } catch (err) {
            reject(err);
        }
    });
}

function createProvider(network) {
    return config.networks[network].provider();
}

function createWeb3(network) {
    return new Web3(createProvider(network));
}

function etherToWei(etherAmount) {
    return new BigNumber(etherAmount)
        .times('1e18')
        .integerValue()
        .toString(10);
}

function weiToEther(weiAmount) {
    return new BigNumber(weiAmount)
        .div('1e18')
        .toString(10);
}

function amountToBase(amount, decimals) {
    return new BigNumber(amount)
        .times(`1e${decimals}`)
        .integerValue()
        .toString(10);
}

function baseToAmount(base, decimals) {
    return new BigNumber(base)
        .div(`1e${decimals}`)
        .toString(10);
}

module.exports = {
    etherToWei,
    weiToEther,
    amountToBase,
    baseToAmount,
    createWeb3,
    createQueryString,
    waitForTxSuccess,
    createProvider,
    BigNumber
};
