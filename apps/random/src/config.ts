import dotenv from 'dotenv';

dotenv.config();

export default {
  soroban: {
    rpcUrl: process.env.BLOCKCHAIN_NODE || 'https://soroban-testnet.stellar.org:443',
    secretKey: process.env.PRIVATE_KEY || '',
    contractId: process.env.DEPLOYED_CONTRACT || '',
    lifetimeInterval: 30 * 60 * 1000, // 30m
  },
  intervals: {
    frequency: parseInt(process.env.FREQUENCY_SECONDS || '120', 10) * 1000,
  },
  drandApiUrl: process.env.DRAND_API_URL || 'https://api.drand.sh/public/latest',
};
