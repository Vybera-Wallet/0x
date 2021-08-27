'use strict'
require('colors');
const fetch = require('node-fetch');
const process = require('process');
const { BigNumber, createWeb3, createQueryString, waitForTxSuccess, amountToBase, baseToAmount, etherToWei } = require('./utils');
const { sellAmount, deployedAddress } = require('./test_config.json');


const API_QUOTE_URL = 'https://api.0x.org/swap/v1/quote';
const ROPSTEN_API_QUOTE_URL = 'https://ropsten.api.0x.org/swap/v1/quote';
const { abi: ABIEX } = require('../build/contracts/ExchangeZRX.json');
const { abi: ABIERC20 } = require('../build/contracts/ERC20.json');

const web3 = createWeb3("ropsten");

async function callZRXAPI(qs) {
    const quoteUrl = `${ROPSTEN_API_QUOTE_URL}?${qs}`;
    // console.info(`Fetching quote ${quoteUrl.bold}...`);
    const response = await fetch(quoteUrl);
    const quote = await response.json();
    if (!response.ok) {
        const msg = JSON.stringify(quote, null, 2);
        console.log(`API response error:\n${msg}`)
        process.exit(1);
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
    console.log(str)
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
                quote.data,
            ).send({
                from: owner,
                value: quote.value,
                gasPrice: quote.gasPrice,
            })).catch(err => {
                console.log(err);
                throw new Error(err)
            });
        const boughtAmount = baseToAmount(receipt.events.BoughtTokens.returnValues.boughtAmount, buyTokenDecimals);
        console.info(`${'✔'.bold.green} Successfully sold ${baseToAmount(sellAmountBase, sellTokenDecimals).toString().bold} ${sellTokenName} for ${boughtAmount.bold.green} ${buyTokenName}!`);
        process.exit(0);
    }
    catch (err) {
        process.exit(1);
    }
}

doSwap(web3, 'all', 'DAI', 'WETH');