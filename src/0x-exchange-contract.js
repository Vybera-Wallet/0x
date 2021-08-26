'use strict'
require('colors');
const fetch = require('node-fetch');
const process = require('process');
const { createWeb3, createQueryString, etherToWei, waitForTxSuccess, weiToEther } = require('./utils');
const { deployedAddress, sellAmount } = require('./test_config.json');

const API_QUOTE_URL = 'https://api.0x.org/swap/v1/quote';
const ROPSTEN_API_QUOTE_URL = 'https://ropsten.api.0x.org/swap/v1/quote';
const { abi: ABIEX } = require('../build/contracts/ExchangeZRX.json');
const { abi: ABIERC20 } = require('../build/contracts/IERC20.json');

async function run(sellAmount, deployedAddress) {
    const web3 = createWeb3("ropsten");
    const contract = new web3.eth.Contract(ABIEX, deployedAddress);
    const [owner] = await web3.eth.getAccounts();

    // Convert sellAmount from token units to wei.
    const sellAmountWei = etherToWei(sellAmount);

    // Get a quote from 0x-API to sell the WETH we just deposited into the contract.
    console.info(`Fetching swap quote from 0x-API to sell ${sellAmount} WETH for DAI...`);
    const qs = createQueryString({
        sellToken: 'WETH',
        buyToken: 'DAI',
        sellAmount: sellAmountWei,
    });
    const quoteUrl = `${ROPSTEN_API_QUOTE_URL}?${qs}`;
    console.info(`Fetching quote ${quoteUrl.bold}...`);
    const response = await fetch(quoteUrl);
    const quote = await response.json();
    var str = JSON.stringify(quote, null, 2); // spacing level = 2
    console.log(str)
    console.info(`Received a quote with price ${quote.price}`);

    const sellToken = new web3.eth.Contract(ABIERC20, quote.sellTokenAddress);
    let receipt;
    // aprove exchange contract to tranfer sell token
    receipt = await waitForTxSuccess(sellToken.methods.approve(
            deployedAddress,
            sellAmountWei
        ).send({
        from: owner,
        gasPrice: quote.gasPrice
    })).catch(err => {
        console.log(err);
        throw new Error(err)
    });

    // Have the contract fill the quote, selling its own WETH.
    console.info(`Filling the quote through the contract at ${deployedAddress.bold}...`);
    receipt = await waitForTxSuccess(contract.methods.fillQuote(
            sellAmountWei,
            quote.sellTokenAddress,
            quote.buyTokenAddress,
            quote.allowanceTarget,
            quote.to,
            quote.data,
        ).send({
            from: owner,
            value: 10,
            gasPrice: quote.gasPrice,
        })).catch(err => {
            console.log(err);
            throw new Error(err)
        });
    const boughtAmount = weiToEther(receipt.events.BoughtTokens.returnValues.boughtAmount);
    console.info(`${'✔'.bold.green} Successfully sold ${sellAmount.toString().bold} WETH for ${boughtAmount.bold.green} DAI!`);
    // The contract now has `boughtAmount` of DAI!
}

run(sellAmount, deployedAddress);