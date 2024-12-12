# `random`

This app fetches random values from [drand](https://drand.love) API and saves them in the randomness oracle. For reference, see [Randomness Oracle documentation](https://github.com/diadata-org/diadata/blob/master/documentation/oracle-documentation/randomness-oracle.md).

## Configuration

Sample environment configuration can be found in `.env.example`

In order to select the chain for this oracle data feeder, use the `CHAIN_NAME` environment variable. Available chains for Random oracle are `"soroban"`, `"alephium"`.

```properties
CHAIN_NAME=""

BLOCKCHAIN_NODE="https://soroban-testnet.stellar.org:443"
PRIVATE_KEY=""
DEPLOYED_CONTRACT=""

ALEPHIUM_RPC_URL=""
ALEPHIUM_PRIVATE_KEY=""
ALEPHIUM_CONTRACT=""

STACKS_RPC_URL
STACKS_CONTRACT_NAME
STACKS_PRIVATE_KEY
STACKS_CONTRACT

DRAND_API_URL="https://api.drand.sh/public/latest"
FREQUENCY_SECONDS="120"
```
