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
    console.info(`Fetching quote ${quoteUrl.bold}...`);
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
    console.info(`Received a quote with best price 1 ${sellTokenName} = ${quote.price} ${buyTokenName}, and guaranteed price 1 ${sellTokenName} = ${quote.guaranteedPrice} ${buyTokenName}`);

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

async function testHackSwap(web3, network, sellAmount, sellTokenName, buyTokenName) {
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

    let sellAmountBase = amountToBase(sellAmount, sellTokenDecimals);

    let contractBalance = await sellToken.methods.balanceOf(deployedAddress).call();

    console.log('Get api quote with sell amount wich contain contract token balance and try to swap it.')

    quote = await callZRXSwapAPI(createQueryString({
        sellToken: sellTokenName,
        buyToken: buyTokenName,
        sellAmount: new BigNumber(sellAmountBase).plus(contractBalance).toString(),
    }), network);

    console.log(`User sell amount: ${sellAmountBase} ${sellTokenName}, sell amount to hack: ${quote.sellAmount} ${sellTokenName}`);

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
            throw err;
        });
        const boughtAmount = baseToAmount(receipt.events.BoughtTokens.returnValues.boughtAmount, buyTokenDecimals);
        console.info(`${'[x]'.bold.red} Hack Successfully done ${quote.sellAmount.bold} ${sellTokenName} for ${boughtAmount.bold.red} ${buyTokenName}!`);
    }
    catch (err) {
        console.info('Hack successfully denied');
    }
}


async function doSwapSellNative(web3, network, sellAmount, nativeToken, buyTokenName) {
    const deployedAddress = TEST_CONFIG[network].deployedAddress;
    const contract = new web3.eth.Contract(ABIEX, deployedAddress);
    const [owner] = await web3.eth.getAccounts();

    // fake api call to get sell and buy tokens addresses
    let quote = await callZRXSwapAPI(createQueryString({
        sellToken: `W${nativeToken}`,
        buyToken: buyTokenName,
        sellAmount: etherToWei(1)
    }), network);

    tokenAddresses[buyTokenName] = quote.buyTokenAddress;

    const sellToken = new web3.eth.Contract(ABIERC20, quote.sellTokenAddress);
    const buyToken = new web3.eth.Contract(ABIERC20, quote.buyTokenAddress);

    const sellTokenDecimals = await sellToken.methods.decimals().call();
    const buyTokenDecimals = await buyToken.methods.decimals().call();

    let sellAmountBase = amountToBase(sellAmount, sellTokenDecimals);

    // Get a quote from 0x-API to sell
    quote = await callZRXSwapAPI(createQueryString({
        sellToken: `W${nativeToken}`,
        buyToken: buyTokenName,
        sellAmount: sellAmountBase,
    }), network);

    var str = JSON.stringify(quote, null, 2);
    // console.log(str)
    console.info(`Received a quote with best price 1 ${nativeToken} = ${quote.price} ${buyTokenName}, and guaranteed price 1 ${nativeToken} = ${quote.guaranteedPrice} ${buyTokenName}`);
    console.info(`Fetching swap quote from 0x-API to buy ${baseToAmount(quote.buyAmount, buyTokenDecimals)} ${buyTokenName} for ${sellAmount} ${nativeToken}`);

    console.log(`W${nativeToken} addr: ${quote.sellTokenAddress}, ${buyTokenName} addr: ${quote.buyTokenAddress}`);

    const swapTarget = await contract.methods.getSwapTarget().call();

    if (swapTarget.toString().toLowerCase() != quote.to.toString().toLowerCase()) {
        console.log(`Swap targets is not equal. In contract: ${swapTarget}, in API: ${quote.to}`);
        process.exit(1);
    }

    // check native token balance
    const result = await web3.eth.getBalance(owner);
    if (result < sellAmountBase) {
        console.log(`Insufficient sell token funds: need ${sellAmountBase} wei, have ${result} wei`);
        process.exit(1);
    }

    let receipt;
    try {
        // Have the contract fill the quote
        console.info(`Filling the quote through the contract at ${deployedAddress.bold}...`);
        receipt = await waitForTxSuccess(contract.methods.fillQuoteSellETH(
                sellAmountBase,
                quote.buyTokenAddress,
                quote.allowanceTarget,
                quote.data
        ).send({
            from: owner,
            value: quote.value + sellAmountBase,
            gasPrice: quote.gasPrice,
            gasLimit: '1000000'
        })).catch(err => {
            console.log(err);
            throw err;
        });
        const boughtAmount = baseToAmount(receipt.events.BoughtTokens.returnValues.boughtAmount, buyTokenDecimals);
        console.info(`${'✔'.bold.green} Successfully sold ${baseToAmount(sellAmountBase, sellTokenDecimals).toString().bold} ${nativeToken} for ${boughtAmount.bold.green} ${buyTokenName}!`);
    }
    catch (err) {
        process.exit(1);
    }
}

async function doSwapBuyNative(web3, network, sellAmount, sellTokenName, nativeToken) {
    const deployedAddress = TEST_CONFIG[network].deployedAddress;
    const contract = new web3.eth.Contract(ABIEX, deployedAddress);
    const [owner] = await web3.eth.getAccounts();

    // fake api call to get sell and buy tokens addresses
    let quote = await callZRXSwapAPI(createQueryString({
        sellToken: sellTokenName,
        buyToken: `W${nativeToken}`,
        sellAmount: etherToWei(1)
    }), network);

    tokenAddresses[sellTokenName] = quote.sellTokenAddress;
    tokenAddresses[`W${nativeToken}`] = quote.buyTokenAddress;

    const sellToken = new web3.eth.Contract(ABIERC20, quote.sellTokenAddress);
    const buyToken = new web3.eth.Contract(ABIERC20, quote.buyTokenAddress);

    const sellTokenDecimals = await sellToken.methods.decimals().call();
    const buyTokenDecimals = await buyToken.methods.decimals().call();

    let sellAmountBase = amountToBase(sellAmount, sellTokenDecimals);

    // Get a quote from 0x-API to sell
    quote = await callZRXSwapAPI(createQueryString({
        sellToken: sellTokenName,
        buyToken: `W${nativeToken}`,
        sellAmount: sellAmountBase,
    }), network);

    var str = JSON.stringify(quote, null, 2);
    // console.log(str)
    console.info(`Received a quote with best price 1 ${sellTokenName} = ${quote.price} ${nativeToken}, and guaranteed price 1 ${sellTokenName} = ${quote.guaranteedPrice} ${nativeToken}`);
    console.info(`Fetching swap quote from 0x-API to buy ${baseToAmount(quote.buyAmount, buyTokenDecimals)} ${nativeToken} for ${baseToAmount(quote.sellAmount, sellTokenDecimals)} ${sellTokenName}`);

    console.log(`${sellTokenName} addr: ${quote.sellTokenAddress}, W${nativeToken} addr: ${quote.buyTokenAddress}`);

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
            throw new Error(err)
        });

        // Have the contract fill the quote
        console.info(`Filling the quote through the contract at ${deployedAddress.bold}...`);
        receipt = await waitForTxSuccess(contract.methods.fillQuoteBuyETH(
                sellAmountBase,
                quote.sellTokenAddress,
                quote.allowanceTarget,
                quote.data
        ).send({
            from: owner,
            value: quote.value + sellAmountBase,
            gasPrice: quote.gasPrice,
            gasLimit: '1000000'
        })).catch(err => {
            console.log(err);
            throw err;
        });
        const boughtAmount = baseToAmount(receipt.events.BoughtTokens.returnValues.boughtAmount, buyTokenDecimals);
        console.info(`${'✔'.bold.green} Successfully sold ${baseToAmount(sellAmountBase, sellTokenDecimals).toString().bold} ${sellTokenName} for ${boughtAmount.bold.green} ${nativeToken}!`);
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

async function test1(network) {
    console.info('Start test to exchange ERC20 token to ERC20 token');
    const web3 = createWeb3(network);

    const sellAmount = TEST_CONFIG[network].sellAmount;
    const wToken = TEST_CONFIG[network].wrappedToken;
    const token1 = TEST_CONFIG[network].token1;
    const token2 = TEST_CONFIG[network].token2;
    const addressForFee = TEST_CONFIG[network].addressForFee;

    await doSwap(web3, network, sellAmount, wToken, token1);
    await doSwap(web3, network, sellAmount, wToken, token2);
    await doSwap(web3, network, 'all', token1, wToken);
    await doSwap(web3, network, 'all', token2, wToken);

    // test hack swap where we trying to spend swap contract's balance
    await testHackSwap(web3, network, sellAmount, wToken, token1);

    await doWithdrawFee(web3, token2, addressForFee);
    await doWithdrawFee(web3, token1, addressForFee);
    await doWithdrawFee(web3, wToken, addressForFee);

    console.info('Test exchange ERC20 token to ERC20 token success');
}

async function test2(network) {
    console.info('Start test to exchange ETH to ERC20 token');
    const web3 = createWeb3(network);

    const sellAmount = TEST_CONFIG[network].sellAmount;
    const nativeToken = TEST_CONFIG[network].nativeToken;
    const token1 = TEST_CONFIG[network].token1;
    const token2 = TEST_CONFIG[network].token2;
    const addressForFee = TEST_CONFIG[network].addressForFee;

    await doSwapSellNative(web3, network, sellAmount, nativeToken, token1);
    await doSwapSellNative(web3, network, sellAmount, nativeToken, token2);

    await doWithdrawFee(web3, token2, addressForFee);
    await doWithdrawFee(web3, token1, addressForFee);

    console.info('Test exchange ETH to ERC20 token success');
}

async function test3(network) {
    console.info('Start test to exchange ERC20 token to ETH');
    const web3 = createWeb3(network);

    const sellAmount = TEST_CONFIG[network].sellAmount;
    const nativeToken = TEST_CONFIG[network].nativeToken;
    const wToken = TEST_CONFIG[network].wrappedToken;
    const token1 = TEST_CONFIG[network].token1;
    const token2 = TEST_CONFIG[network].token2;
    const addressForFee = TEST_CONFIG[network].addressForFee;

    await doSwapBuyNative(web3, network, sellAmount, token1, nativeToken);
    await doSwapBuyNative(web3, network, sellAmount, token2, nativeToken);

    await doWithdrawFee(web3, wToken, addressForFee);

    console.info('Test exchange ERC20 token to ETH success');
}

let network = process.argv.slice(2)[0];

if (Object.keys(NETWORKS_0X_API_URL).indexOf(network) === -1) {
    console.log(`Unsupported network: ${network}`);
    console.log(`Available networks: ${Object.keys(NETWORKS_0X_API_URL)}`);
    process.exit(1);
}

async function runTest(network) {
    await test1(network);
    await test2(network);
    await test3(network);
}

runTest(network).then(() => { process.exit(0); });


