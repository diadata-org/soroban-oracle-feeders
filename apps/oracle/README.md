# `oracle`

This app fetches asset data from DIA API and stores it in the key/value oracle deployed on Soroban. For reference, see [diaOracleV2MultiupdateService](https://github.com/diadata-org/diadata/tree/master/cmd/blockchain/ethereum/diaOracleV2MultiupdateService>).

## Configuration

Sample environment configuration can be found in `.env.example`

In order to select the chain for this oracle data feeder, use the `CHAIN_NAME` environment variable. Available chains are `"kadena"`, `"soroban"`, `"alephium"`, `"stacks"`, `"opnet"`, `"midnight"`

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
OPNET_NETWORK="regtest"

# if differs from default
OPNET_FEE_RATE=""
OPNET_PRIORITY_FEE=""

MIDNIGHT_NETWORK_ID="preprod"
MIDNIGHT_INDEXER_URL="https://indexer.preprod.midnight.network/api/v4/graphql"
MIDNIGHT_INDEXER_WS_URL="wss://indexer.preprod.midnight.network/api/v4/graphql/ws"
MIDNIGHT_NODE_URL="wss://rpc.preprod.midnight.network"
MIDNIGHT_PROOF_SERVER_URL="http://127.0.0.1:6300"
MIDNIGHT_SEED=""
MIDNIGHT_CONTRACT=""
# optional
MIDNIGHT_PRIVATE_STATE_DIR=""
MIDNIGHT_PRIVATE_STATE_PASSWORD=""
MIDNIGHT_SYNC_CACHE_DIR=""
MIDNIGHT_SYNC_TIMEOUT_SECONDS="3600"

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

## Midnight

The Midnight feeder writes to the key/value oracle from the [DIA Midnight oracles](../../../midnight) repository. Its compiled contract artifacts (contract JS, prover/verifier keys, ZKIR) are vendored in `packages/common/src/midnight/managed/oracle`; recompile the contract there and copy the `managed/oracle` directory over whenever `oracle.compact` changes.

- `MIDNIGHT_SEED` is the 24-word mnemonic (or 32-byte hex seed) of the wallet that deployed the contract, or the one it was handed to with `change_oracle_updater`. The wallet pays fees in DUST.
- `MIDNIGHT_CONTRACT` is the deployed contract address (hex). Deploy it with the `oracle-cli` of the Midnight repository.
- Every write is proven locally, so a [Midnight proof server](https://docs.midnight.network/develop/tutorial/using/proof-server) must be reachable at `MIDNIGHT_PROOF_SERVER_URL`. Its version must match the network (see `oracle-cli/proof-server-*.yml` in the Midnight repository).
- On startup the wallet syncs against the chain before the first update is sent. On a fresh wallet this can take a long time; set `MIDNIGHT_SYNC_CACHE_DIR` to a persistent, writable directory so restarts resume from the saved state. The feeder exits if the sync does not finish within `MIDNIGHT_SYNC_TIMEOUT_SECONDS`.
- The contract only accepts batches of exactly 10 entries. Updates are split into batches of 10 and short batches are padded by repeating their last entry.
- Prices are stored with 8 decimals and timestamps in Unix milliseconds, as on Stacks, Alephium and OP_NET.
