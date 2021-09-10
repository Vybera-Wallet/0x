'use strict'
require('colors');
const fetch = require('node-fetch');
const process = require('process');
const { BigNumber, createWeb3, createQueryString, waitForTxSuccess, amountToBase, baseToAmount, etherToWei } = require('./utils');
const TEST_CONFIG = require('./test_config.json');

const NETWORKS_0X_API_URL = {
    'mainnet': 'https://api.0x.org/',
    'ropsten': 'https://ropsten.api.0x.org/',
    'bsc': 'https://bsc.api.0x.org/',
    'polygon': 'https://polygon.api.0x.org/'
}

const { abi: ABIEX } = require('../build/contracts/ExchangeZRX.json');
const { abi: ABIERC20 } = require('../build/contracts/ERC20.json');

// addresses for withdraw fee
let tokenAddresses = {};

async function callZRXSwapAPI(qs, network) {
    const quoteUrl = `${NETWORKS_0X_API_URL[network]}swap/v1/quote?${qs}`;
    // console.info(`Fetching quote ${quoteUrl.bold}...`);
    const response = await fetch(quoteUrl);
    const quote = await response.json();
    if (!response.ok) {
        const msg = JSON.stringify(quote, null, 2);
        throw new Error(`Query:\n${qs}\nAPI response error:\n${msg}`);
    }

    return quote;
}

async function doSwap(web3, network, sellAmount, sellTokenName, buyTokenName) {
    const deployedAddress = TEST_CONFIG[network].deployedAddress;
    const contract = new web3.eth.Contract(ABIEX, deployedAddress);
    const [owner] = await web3.eth.getAccounts();
    // fake api call to get sell and buy tokens addresses
    let quote = await callZRXSwapAPI(createQueryString({
        sellToken: sellTokenName,
        buyToken: buyTokenName,
        sellAmount: etherToWei(1)
    }), network);

    tokenAddresses[sellTokenName] = quote.sellTokenAddress;
    tokenAddresses[buyTokenName] = quote.buyTokenAddress;

    const sellToken = new web3.eth.Contract(ABIERC20, quote.sellTokenAddress);
    const buyToken = new web3.eth.Contract(ABIERC20, quote.buyTokenAddress);

    const sellTokenDecimals = await sellToken.methods.decimals().call();
    const buyTokenDecimals = await buyToken.methods.decimals().call();

    let sellAmountBase;
    if (sellAmount === 'all') {
        sellAmountBase = await sellToken.methods.balanceOf(owner).call();
    }
    else {
        sellAmountBase = amountToBase(sellAmount, sellTokenDecimals);
    }

    // Get a quote from 0x-API to sell
    console.info(`Fetching swap quote from 0x-API to sell ${baseToAmount(sellAmountBase, sellTokenDecimals)} ${sellTokenName} for ${buyTokenName} ...`);

    console.log(`${sellTokenName}: ${quote.sellTokenAddress}, ${buyTokenName}: ${quote.buyTokenAddress}`);

    quote = await callZRXSwapAPI(createQueryString({
        sellToken: sellTokenName,
        buyToken: buyTokenName,
        sellAmount: sellAmountBase,
    }), network);

    var str = JSON.stringify(quote, null, 2);
    // console.log(str)
    console.info(`Received a quote with price ${quote.price}`);

    const swapTarget = await contract.methods.getSwapTarget().call();

    if (swapTarget.toString().toLowerCase() != quote.to.toString().toLowerCase()) {
        console.log(`Swap targets is not equal. In contract: ${swapTarget}, in API: ${quote.to}`);
        process.exit(1);
    }

    // check sellTokenBalance
    const result = await sellToken.methods.balanceOf(owner).call();
    if (result < sellAmountBase) {
        console.log(`Insufficient sell token funds: need ${sellAmountBase}, have ${result}`);
        process.exit(1);
    }
    let receipt;
    try {
        // aprove exchange contract to tranfer sell token from owner to self
        receipt = await waitForTxSuccess(sellToken.methods.approve(
                deployedAddress,
                sellAmountBase
        ).send({
            from: owner,
            gasPrice: quote.gasPrice
        })).catch(err => {
            console.log(err);
            throw new Error(err)
        });

        // Have the contract fill the quote
        console.info(`Filling the quote through the contract at ${deployedAddress.bold}...`);
        receipt = await waitForTxSuccess(contract.methods.fillQuote(
                sellAmountBase,
                quote.sellTokenAddress,
                quote.buyTokenAddress,
                quote.allowanceTarget,
                quote.data
        ).send({
            from: owner,
            value: quote.value,
            gasPrice: quote.gasPrice,
            gasLimit: '1000000'
        })).catch(err => {
            console.log(err);
            throw err;
        });
        const boughtAmount = baseToAmount(receipt.events.BoughtTokens.returnValues.boughtAmount, buyTokenDecimals);
        console.info(`${'✔'.bold.green} Successfully sold ${baseToAmount(sellAmountBase, sellTokenDecimals).toString().bold} ${sellTokenName} for ${boughtAmount.bold.green} ${buyTokenName}!`);
    }
    catch (err) {
        process.exit(1);
    }
}

async function doWithdrawFee(web3, tokenName, recipientAddress) {
    const deployedAddress = TEST_CONFIG[network].deployedAddress;
    const contract = new web3.eth.Contract(ABIEX, deployedAddress);
    const [owner] = await web3.eth.getAccounts();

    const token = new web3.eth.Contract(ABIERC20, tokenAddresses[tokenName]);
    const tokenDecimals = await token.methods.decimals().call();
    try {
        let receipt = await waitForTxSuccess(contract.methods.withdrawFee(
            tokenAddresses[tokenName],
            recipientAddress
        ).send({
            from: owner
        })).catch(err => {
            console.log(err);
            throw err;
        });

        const amount = baseToAmount(receipt.events.WithdrawFee.returnValues.amount, tokenDecimals);
        console.info(`${'✔'.bold.green} Successfully withdraw ${amount.toString().bold} ${tokenName}!`);
    }
    catch (err) {
        console.info(`${'✕'.bold.red} Failed to withdraw ${tokenName}!`);
        process.exit(1);
    }
}

async function runTest(network) {
    const web3 = createWeb3(network);

    const sellAmount = TEST_CONFIG[network].sellAmount;
    const wToken = TEST_CONFIG[network].wrappedToken;
    const token1 = TEST_CONFIG[network].token1;
    const token2 = TEST_CONFIG[network].token2;

    await doSwap(web3, network, sellAmount, wToken, token1);
    await doSwap(web3, network, sellAmount, wToken, token2);
    await doSwap(web3, network, 'all', token1, wToken);
    await doSwap(web3, network, 'all', token2, wToken);
    await doWithdrawFee(web3, token2, '0xd2bf9C5D18d2f6819F2c13F3A32fcFc3C9DBD2e7');
    await doWithdrawFee(web3, token1, '0xd2bf9C5D18d2f6819F2c13F3A32fcFc3C9DBD2e7');
    await doWithdrawFee(web3, wToken, '0xd2bf9C5D18d2f6819F2c13F3A32fcFc3C9DBD2e7');
    process.exit(0);
}

let network = process.argv.slice(2)[0];

if (Object.keys(NETWORKS_0X_API_URL).indexOf(network) === -1) {
    console.log(`Unsupported network: ${network}`);
    console.log(`Available networks: ${Object.keys(NETWORKS_0X_API_URL)}`);
    process.exit(1);
}

runTest(network).then(() => { process.exit(0); });

