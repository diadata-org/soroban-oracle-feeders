import dotenv from 'dotenv';

dotenv.config();

export enum ChainName {
  SOROBAN = 'soroban',
  ALEPHIUM = 'alephium',
}

export default {
  soroban: {
    rpcUrl: process.env.BLOCKCHAIN_NODE || 'https://soroban-testnet.stellar.org:443',
    secretKey: process.env.PRIVATE_KEY || '',
    contractId: process.env.DEPLOYED_CONTRACT || '',
    lifetimeInterval: 30 * 60 * 1000, // 30m
    maxRetryAttempts: 3,
  },
  alephium: {
    rpcUrl: process.env.ALEPHIUM_RPC_URL || 'http://localhost:22973',
    secretKey: process.env.ALEPHIUM_PRIVATE_KEY || '',
    contract: process.env.ALEPHIUM_CONTRACT || 'vpi15NKaU7oQSyvHczic9EVnY5xKdNukK3hgbMKsFCT1',
    maxRetryAttempts: 3,
  },
  chainName: process.env.CHAIN_NAME as ChainName || ChainName.SOROBAN,
  intervals: {
    frequency: parseInt(process.env.FREQUENCY_SECONDS || '120', 10) * 1000,
  },
  drandApiUrl: process.env.DRAND_API_URL || 'https://api.drand.sh/public/latest',
};
