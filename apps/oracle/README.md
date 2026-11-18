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

# "mainnet" or "preprod"; the endpoints are Blockfrost's, with a project ID for that network
MIDNIGHT_NETWORK_ID="mainnet"
MIDNIGHT_INDEXER_URL="https://midnight-mainnet.blockfrost.io/api/v0?project_id=<project id>"
MIDNIGHT_INDEXER_WS_URL="wss://midnight-mainnet.blockfrost.io/api/v0/ws?project_id=<project id>"
MIDNIGHT_NODE_URL="wss://rpc.midnight-mainnet.blockfrost.io?project_id=<project id>"
# proof server 9.0.0 (ledger 9), local only
MIDNIGHT_PROOF_SERVER_URL="http://127.0.0.1:6300"
MIDNIGHT_SEED=""
MIDNIGHT_CONTRACT=""
# optional
MIDNIGHT_PRIVATE_STATE_DIR=""
MIDNIGHT_PRIVATE_STATE_PASSWORD=""
MIDNIGHT_SYNC_CACHE_DIR=""
MIDNIGHT_SYNC_TIMEOUT_SECONDS="3600"
# resync when the wallet has had no indexer update for this long; 0 disables
MIDNIGHT_STALE_RESYNC_SECONDS="900"
# wait between transaction retries (this, then 2x, ...)
MIDNIGHT_RETRY_DELAY_SECONDS="20"

FREQUENCY_SECONDS="120"
MANDATORY_FREQUENCY_SECONDS="0"

DEVIATION_PERMILLE="10"
# decimals of the values written on chain (Soroban, Stacks, Alephium, OP_NET, Midnight; not Kadena)
ORACLE_DECIMALS="8"

GQL_WINDOW_SIZE="120"
CONDITIONAL_ASSETS=""
GQL_METHODOLOGY="vwap"
ASSETS=""
GQL_ASSETS="Ethereum-0x6B175474E89094C44Da98b954EedeAC495271d0F-DAI"

# Lumina data source (instead of ASSETS / GQL_ASSETS; set exactly one of the three)
# Format: <lumina key>§<symbol>[§<coingecko name>§<cmc name>§<allowed deviation>], separated by ";"
# Prices are read from DIA Lasernet (see LUMINA_SOURCE) and published as <symbol>/USD with
# ORACLE_DECIMALS decimals. A key ending in usdh-token-v1 keeps the Hermetica USDh calculation
LUMINA_ASSETS=""
LUMINA_RPC_URL="https://rpc.diadata.org"
LUMINA_BACKUP_RPC_URL=""
# "intents" (default): latest signed intent from the OracleIntentRegistry, getLatestIntentByType;
# "metacontract": DIAOracleV2 getValue (then LUMINA_ORACLE_V2_ADDRESS is required)
LUMINA_SOURCE="intents"
# defaults to the OracleIntentRegistry on DIA Lasernet (0x5612599CF48032d7428399d5Fcb99eDcc75c06A7)
LUMINA_INTENT_REGISTRY_ADDRESS=""
LUMINA_INTENT_TYPE="OracleUpdate"
LUMINA_ORACLE_V2_ADDRESS=""
# skip values older than this; 0 disables the check
DATA_AGE_TIMEOUT_SECONDS="0"
# decimals of the values in the Lumina contract
LUMINA_DECIMALS="18"

COINGECKO_API_KEY=""
COINGECKO_API_URL="https://pro-api.coingecko.com"

CMC_API_KEY=""
CMC_API_URL="https://pro-api.coinmarketcap.com"
```

## Lumina on Stacks, Alephium and Soroban

Every chain reads Lumina the same way as Midnight: set `LUMINA_ASSETS` instead of `ASSETS` (or `GQL_ASSETS`) and leave `LUMINA_SOURCE` at `intents`. Nothing else in the chain settings changes, and the oracle keeps the values the DIA API feeders wrote before:

- **Keys.** The second field of each entry is the symbol, and the feeder writes `<symbol>/USD`, as with `ASSETS`. Use the exact symbol of the old entry (case included), or the chain gets a new key and the old one stops updating.
- **Decimals.** Lumina values have 18 decimals. They are cut to `ORACLE_DECIMALS` decimals before writing (default 8, the scale every DIA API feeder used; keep it at 8 for existing contracts) and truncated as before (`Math.floor`). Prices pass through the feeder as JS numbers, so only their first 15-17 significant digits are exact; with more decimals the rest are written as zeros. The conversion works on the decimal value, so a price like 0.29 is written as `29000000` (the old float maths wrote `28999999`).
- **Timestamps.** Unchanged: the time of the update, in seconds on Soroban and in milliseconds on Stacks and Alephium.
- **Guardians.** CoinGecko/CMC names and the allowed deviation go in the same trailing fields as before, on every chain. Give all three fields (`§<coingecko>§<cmc>§<deviation>`, leaving one name empty if needed): with only one field the check is ignored, and without a deviation it is 0, so every update is rejected.
- **USDh (Stacks).** Lumina has no USDh feed. An entry whose key is the USDh token address from the old `ASSETS` entry still prices USDh from the Hermetica reserves.

Converting an `ASSETS` entry means replacing `<network>§<address>` with the Lumina key, which is the pair the attestors publish (`<SYMBOL>/USD`):

```sh
# before
ASSETS="Bitcoin§0x0000000000000000000000000000000000000000§BTC§bitcoin§bitcoin§0.03;Stacks§0x0000000000000000000000000000000000000000§STX;Stacks§<deployer>.usdh-token-v1§USDh"
# after
LUMINA_ASSETS="BTC/USD§BTC§bitcoin§bitcoin§0.03;STX/USD§STX;<deployer>.usdh-token-v1§USDh"
```

Before switching, check that the registry has a recent intent for every key (an entry without one is skipped and logged on each round):

```sh
cast call 0x5612599CF48032d7428399d5Fcb99eDcc75c06A7 \
  'getLatestIntentByType(string,string)((string,string,uint256,uint256,uint256,string,uint256,uint256,string,bytes,address))' \
  OracleUpdate STX/USD --rpc-url https://rpc.diadata.org
```

## Midnight

The Midnight feeder writes to the key/value oracle from the [DIA Midnight oracles](../../../midnight) repository. Its compiled contract artifacts (contract JS, prover/verifier keys, ZKIR) are vendored in `packages/common/src/midnight/managed/oracle`; recompile the contract there and copy the `managed/oracle` directory over whenever `oracle.compact` changes. The artifacts must be the exact build of the deployed contract: its verifier keys are checked on-chain, and the `compiler/` manifest is checked before each proof. Mainnet and preprod run ledger 9, so the contract is compiled with Compact toolchain 0.36.0.

- `MIDNIGHT_SEED` is the 24-word mnemonic (or 32-byte hex seed) of the wallet that deployed the contract, or the one it was handed to with `change_oracle_updater`. The wallet pays fees in DUST.
- `MIDNIGHT_CONTRACT` is the deployed contract address (hex). Deploy it with the `oracle-cli` of the Midnight repository.
- Every write is proven locally, so a [Midnight proof server](https://docs.midnight.network/develop/tutorial/using/proof-server) must be reachable at `MIDNIGHT_PROOF_SERVER_URL`. Its version must match the network (see `oracle-cli/proof-server-*.yml` in the Midnight repository).
- On startup the wallet syncs against the chain before the first update is sent. On a fresh wallet this can take a long time; set `MIDNIGHT_SYNC_CACHE_DIR` to a persistent, writable directory (a PersistentVolume on Kubernetes) so restarts resume from the saved state. The sync progress is saved there every 5 minutes, and when the sync fails. The feeder exits if the sync does not finish within `MIDNIGHT_SYNC_TIMEOUT_SECONDS`, and the next start continues from the last save. A full sync from scratch replays every shielded and DUST event of the chain and needs several CPU cores; copying the cache file (`wallet-<network>-<address suffix>.json`) from a synced feeder skips it.
- After that, a watchdog keeps the wallet in sync in the background. The SDK never reconnects a dropped indexer subscription, so the feeder resumes the wallet from its saved state when an indexer connection drops, when the process was suspended (e.g. a laptop sleeping), or when the wallet has had no update for `MIDNIGHT_STALE_RESYNC_SECONDS`. It also saves the sync cache every 10 minutes. Transactions wait for any resync and for the wallet to catch up first.
- The contract only accepts batches of exactly 10 entries. Updates are split into batches of 10 and short batches are padded by repeating their last entry.
- Prices are stored with `ORACLE_DECIMALS` decimals (default 8) and timestamps in Unix milliseconds, as on Stacks, Alephium and OP_NET.
