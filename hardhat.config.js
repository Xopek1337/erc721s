/**
 * @type import('hardhat/config').HardhatUserConfig
 */

 require('@nomiclabs/hardhat-ethers');
 require("@nomiclabs/hardhat-waffle");
 require("@nomiclabs/hardhat-etherscan");
 require('hardhat-contract-sizer');
 require("dotenv").config();
 require("hardhat-deploy");
 require('solidity-coverage')

 
 //const {alchemyApiKeyMain} = require('./secrets.json');
 
module.exports = {
  solidity: "0.8.11",
  networks: {
    rinkeby: {
      url: process.env.RPC_NODE_URL_RINKEBY,
      gasPrice: 5000000000, //5 gwei
      timeout: 3600000,
      accounts: [process.env.PRIVATE_KEY]
    },
    goerli: {
      url: process.env.RPC_NODE_URL_GOERLI,
      gasPrice: 5000000000, //5 gwei
      timeout: 3600000,
      accounts: [process.env.PRIVATE_KEY]
    },
    localhost: {
      gasPrice: 200000000000, //200 gwei
      url: process.env.RPC_NODE_URL_LOCALHOST,
      accounts: ["0x92f01a49ceea0186dd302544c4f20a41958baa628e22286e8396f23dd9239f90"],
      mining: {
        auto: false,
        interval: [13000, 16000]
      },
    },
    bsc: {
      url: process.env.RPC_NODE_URL_BSCTESTNET,
      gasPrice: 50000000000, //50 gwei
      timeout: 3600000,
      accounts: [process.env.PRIVATE_KEY]
    },
    // mainnet: {
    //   url: `https://eth-mainnet.alchemyapi.io/v2/${alchemyApiKeyMain}`,
    //   gasPrice: 100000000000, //100 gwei
    //   accounts: [process.env.PRIVATE_KEY]
    // }
  },
  etherscan: {
    apiKey: process.env.SCAN_API_KEY_BSC
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  plugins: ["solidity-coverage"]
};
