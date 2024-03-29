/**
 * Use this file to configure your truffle project. It's seeded with some
 * common settings for different networks and features like migrations,
 * compilation and testing. Uncomment the ones you need or modify
 * them to suit your project as necessary.
 *
 * More information about configuration can be found at:
 *
 * trufflesuite.com/docs/advanced/configuration
 *
 * To deploy via Infura you'll need a wallet provider (like @truffle/hdwallet-provider)
 * to sign your transactions before they're sent to a remote public node. Infura accounts
 * are available for free at: infura.io/register.
 *
 * You'll also need a mnemonic - the twelve word phrase the wallet uses to generate
 * public/private key pairs. If you're publishing your code to GitHub make sure you load this
 * phrase from a file you've .gitignored so it doesn't accidentally become public.
 *
 */

require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const fs = require('fs');

const mnemonic = fs.readFileSync('.secret').toString().trim();


const ropstenNetworkConfig = {
  provider: () => new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/${process.env.INFURA_ID}`),
  network_id: 3, // Ropsten's id
  networkCheckTimeout: 10000000,
  gasLimit: 5000000,
  from: process.env.DEPLOYER_ACCOUNT, // contracts owner address
  websockets: true,
  confirmations: 2,
  gasPrice: 2000000000,
};

const rinkebyNetworkConfig = {
  provider: () => new HDWalletProvider(mnemonic, `https://rinkeby.infura.io/v3/${process.env.INFURA_ID}`),
  network_id: 4, // Rinkeby's id
  networkCheckTimeout: 10000000,
  gasLimit: 5000000,
  from: process.env.DEPLOYER_ACCOUNT, // contracts owner address
  websockets: true,
  confirmations: 2,
  gasPrice: 2000000000,
};

const mainnetNetworkConfig = {
  provider: () => new HDWalletProvider(mnemonic, `https://mainnet.infura.io/v3/${process.env.INFURA_ID}`),
  network_id: 1, // mainnet's id
  networkCheckTimeout: 10000000,
  gasLimit: 5000000,
  from: process.env.DEPLOYER_ACCOUNT, // contracts owner address
  websockets: true,
  confirmations: 10,
  gasPrice: 125000000000,
};

const bscNetworkConfig = {
  provider: () => new HDWalletProvider(mnemonic, `https://bsc-dataseed1.binance.org`),
  network_id: 56, // BSC mainnet's id
  confirmations: 10,
  timeoutBlocks: 200,
  skipDryRun: true
};

const bscTestnetNetworkConfig = {
  provider: () => new HDWalletProvider(mnemonic, `https://data-seed-prebsc-1-s1.binance.org:8545`),
  network_id: 97, // BSC testnet's id
  confirmations: 2,
  timeoutBlocks: 200,
  skipDryRun: true
};

const polygonNetworkConfig = {
  provider: () => new HDWalletProvider(mnemonic, `https://polygon-mainnet.infura.io/v3/${process.env.INFURA_ID}`),
  network_id: 137, // Polygon mainnet's id
  networkCheckTimeout: 10000000,
  gasLimit: 5000000,
  from: process.env.DEPLOYER_ACCOUNT, // contracts owner address
  websockets: true,
  confirmations: 10,
  gasPrice: 125000000000,
};

const polygonMumbaiNetworkConfig = {
  provider: () => new HDWalletProvider(mnemonic, `https://polygon-mumbai.infura.io/v3/${process.env.INFURA_ID}`),
  network_id: 80001, // Polygon testnet's id
  networkCheckTimeout: 10000000,
  gasLimit: 5000000,
  from: process.env.DEPLOYER_ACCOUNT, // contracts owner address
  websockets: true,
  confirmations: 10,
  gasPrice: 125000000000,
};

// Not supported in 0x API
/*
const bscTestnetNetworkConfig = {
  provider: () => new HDWalletProvider(mnemonic, `https://data-seed-prebsc-1-s1.binance.org:8545`),
  network_id: 97,
  confirmations: 2,
  timeoutBlocks: 200,
  skipDryRun: true
};
*/



module.exports = {
  /**
   * Networks define how you connect to your ethereum client and let you set the
   * defaults web3 uses to send transactions. If you don't specify one truffle
   * will spin up a development blockchain for you on port 9545 when you
   * run `develop` or `test`. You can ask a truffle command to use a specific
   * network from the command line, e.g
   *
   * $ truffle test --network <network-name>
   */

  networks: {
    // Useful for testing. The `development` name is special - truffle uses it by default
    // if it's defined here and no other network is specified at the command line.
    // You should run a client (like ganache-cli, geth or parity) in a separate terminal
    // tab if you use this network and you must also set the `host`, `port` and `network_id`
    // options below to some value.

    develop: {
      port: 8545,
      network_id: 20,
      accounts: 5,
      defaultEtherBalance: 500,
      blockTime: 3
    },

    // development: {
    //  host: "127.0.0.1",     // Localhost (default: none)
    //  port: 8545,            // Standard Ethereum port (default: none)
    //  network_id: "*",       // Any network (default: none)
    // },
    // Another network with more advanced options...
    // advanced: {
    // port: 8777,             // Custom port
    // network_id: 1342,       // Custom network
    // gas: 8500000,           // Gas sent with each transaction (default: ~6700000)
    // gasPrice: 20000000000,  // 20 gwei (in wei) (default: 100 gwei)
    // from: <address>,        // Account to send txs from (default: accounts[0])
    // websockets: true        // Enable EventEmitter interface for web3 (default: false)
    // },
    // Useful for deploying to a public network.
    // NB: It's important to wrap the provider as a function.
    ropsten: ropstenNetworkConfig,
    rinkeby: rinkebyNetworkConfig,
    mainnet: mainnetNetworkConfig,
    polygon: polygonNetworkConfig,
    polygonMumbai: polygonMumbaiNetworkConfig,
    bsc: bscNetworkConfig,
    bscTestnet: bscTestnetNetworkConfig,

    // Useful for private networks
    // private: {
    // provider: () => new HDWalletProvider(mnemonic, `https://network.io`),
    // network_id: 2111,   // This network is yours, in the cloud.
    // production: true    // Treats this network as if it was a public net. (default: false)
    // }
  },

  // Set default mocha options here, use special reporters etc.
  mocha: {
    reporter: 'eth-gas-reporter',
    gasReporter: { 'gasPrice': 1 },
    timeout: 20000000
  },

  api_keys: {
    etherscan: process.env.ETHERSCAN_API_KEY,
  },

  contracts_directory: 'contractsDirectory',
  // Configure your compilers
  compilers: {
    solc: {
      version: 'solcVersion', // Fetch exact version from solc-bin (default: truffle's version)
      // docker: true,        // Use "0.5.1" you've installed locally with docker (default: false)
      settings: { // See the solidity docs for advice about optimization and evmVersion
        optimizer: {
          enabled: true,
          runs: 1000, // should be 200 but deployed with 1000
        },
      },
    },
  },

  plugins: [
    'solidity-coverage',
    'truffle-plugin-verify',
  ],
};
