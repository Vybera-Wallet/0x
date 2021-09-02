'use strict'
require('colors');
const fetch = require('node-fetch');
const process = require('process');
const { BigNumber, createWeb3, createQueryString, waitForTxSuccess, amountToBase, baseToAmount, etherToWei } = require('./utils');
const { sellAmount, deployedAddress } = require('./test_config.json');


// const API_QUOTE_URL = 'https://api.0x.org/swap/v1/quote';
const ROPSTEN_API_QUOTE_URL = 'https://ropsten.api.0x.org/swap/v1/quote';
const { abi: ABIEX } = require('../build/contracts/ExchangeZRX.json');
const { abi: ABIERC20 } = require('../build/contracts/ERC20.json');

// addresses for withdraw fee
let tokenAddresses = {}

async function callZRXAPI(qs) {
    const quoteUrl = `${ROPSTEN_API_QUOTE_URL}?${qs}`;
    // console.info(`Fetching quote ${quoteUrl.bold}...`);
    const response = await fetch(quoteUrl);
    const quote = await response.json();
    if (!response.ok) {
        const msg = JSON.stringify(quote, null, 2);
        throw new Error(`Query:\n${qs}\nAPI response error:\n${msg}`);
    }

    return quote;
}

async function doSwap(web3, sellAmount, sellTokenName, buyTokenName) {
    const contract = new web3.eth.Contract(ABIEX, deployedAddress);
    const [owner] = await web3.eth.getAccounts();
    // fake call api to get sell and buy tokens addresses
    let quote = await callZRXAPI(createQueryString({
        sellToken: sellTokenName,
        buyToken: buyTokenName,
        sellAmount: etherToWei(1)
    }));

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

    quote = await callZRXAPI(createQueryString({
        sellToken: sellTokenName,
        buyToken: buyTokenName,
        sellAmount: sellAmountBase,
    }));

    var str = JSON.stringify(quote, null, 2);
    // console.log(str)
    console.info(`Received a quote with price ${quote.price}`);

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
                quote.to,
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
    const contract = new web3.eth.Contract(ABIEX, deployedAddress);
    const [owner] = await web3.eth.getAccounts();

    const token = new web3.eth.Contract(ABIERC20, tokenAddresses[tokenName]);
    const tokenDecimals = await token.methods.decimals().call();
    try {
        let receipt = await waitForTxSuccess(contract.methods.withdrawTokenFee(
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

async function runTest() {
    const web3 = createWeb3("ropsten");

    await doSwap(web3, '0.1', 'WETH', 'USDC');
    await doSwap(web3, '0.1', 'WETH', 'DAI');
    await doSwap(web3, 'all', 'USDC', 'WETH');
    await doSwap(web3, 'all', 'DAI', 'WETH');
    await doWithdrawFee(web3, 'DAI', '0xd2bf9C5D18d2f6819F2c13F3A32fcFc3C9DBD2e7');
    await doWithdrawFee(web3, 'USDC', '0xd2bf9C5D18d2f6819F2c13F3A32fcFc3C9DBD2e7');
    await doWithdrawFee(web3, 'WETH', '0xd2bf9C5D18d2f6819F2c13F3A32fcFc3C9DBD2e7');
    process.exit(0);
}


runTest().then(() => { process.exit(0); });

