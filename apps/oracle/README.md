# `oracle`

This app fetches asset data from DIA API and stores it in the key/value oracle deployed on Soroban. For reference, see [diaOracleV2MultiupdateService](https://github.com/diadata-org/diadata/tree/master/cmd/blockchain/ethereum/diaOracleV2MultiupdateService>).

## Configuration

Sample environment configuration can be found in `.env.example`

In order to select the chain for this oracle data feeder, use the `CHAIN_NAME` environment variable. Available chains are `"kadena"`, `"soroban"`, `"alephium"`, `"stacks"`, `"opnet"`

```properties
CHAIN_NAME=""

SOROBAN_BLOCKCHAIN_NODE="https://soroban-testnet.stellar.org:443"
SOROBAN_PRIVATE_KEY=""
SOROBAN_DEPLOYED_CONTRACT=""

KADENA_PRIVATE_KEY=""
KADENA_PUBLIC_KEY=""
KADENA_RPC_URL=""
KADENA_NETWORK_ID=""
KADENA_CHAIN_ID=""
KADENA_CONTRACT=""

ALEPHIUM_RPC_URL=""
ALEPHIUM_PRIVATE_KEY=""
ALEPHIUM_CONTRACT=""

STACKS_RPC_URL=""
STACKS_BACKUP_RPC_URL=""
STACKS_CONTRACT_NAME="dia-oracle"
STACKS_PRIVATE_KEY=""
STACKS_CONTRACT=""
STACKS_FEE_RATE="100"

OPNET_RPC_URL=""
OPNET_BACKUP_RPC_URL=""
OPNET_PRIVATE_KEY=""
OPNET_CONTRACT=""

# if differs from default
OPNET_FEE_RATE=""
OPNET_PRIORITY_FEE=""

FREQUENCY_SECONDS="120"
MANDATORY_FREQUENCY_SECONDS="0"

DEVIATION_PERMILLE="10"

GQL_WINDOW_SIZE="120"
CONDITIONAL_ASSETS=""
GQL_METHODOLOGY="vwap"
ASSETS=""
GQL_ASSETS="Ethereum-0x6B175474E89094C44Da98b954EedeAC495271d0F-DAI"

COINGECKO_API_KEY=""
COINGECKO_API_URL="https://pro-api.coingecko.com"

CMC_API_KEY=""
CMC_API_URL="https://pro-api.coinmarketcap.com"
```
