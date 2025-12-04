// src/app/config/testnet.config.ts
export const TESTNET_CONFIGS = {
  sepolia: {
    name: 'Sepolia Testnet',
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
    chainId: 11155111,
    explorer: 'https://sepolia.etherscan.io'
  },
  goerli: {
    name: 'Goerli Testnet',
    rpcUrl: 'https://goerli.infura.io/v3/YOUR_PROJECT_ID',
    chainId: 5,
    explorer: 'https://goerli.etherscan.io'
  },
  mumbai: {
    name: 'Polygon Mumbai',
    rpcUrl: 'https://polygon-mumbai.infura.io/v3/YOUR_PROJECT_ID',
    chainId: 80001,
    explorer: 'https://mumbai.polygonscan.com'
  }
};

export interface DeploymentConfig {
  testnet: keyof typeof TESTNET_CONFIGS;
  privateKey: string;
  gasLimit: number;
}
