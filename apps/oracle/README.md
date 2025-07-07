# `oracle`

This app fetches asset data from DIA API and stores it in the key/value oracle deployed on Soroban. For reference, see [diaOracleV2MultiupdateService](https://github.com/diadata-org/diadata/tree/master/cmd/blockchain/ethereum/diaOracleV2MultiupdateService>).

## Configuration

Sample environment configuration can be found in `.env.example`

In order to select the chain for this oracle data feeder, use the `CHAIN_NAME` environment variable. Available chains are `"kadena"`, `"soroban"`, `"alephium"`, `"stacks"`, `"opnet"`, `"midnight"`

## Midnight Integration

### Testnet Setup

**IMPORTANT**: The Midnight integration is currently configured for **Midnight Testnet**. The Midnight network is still in development, and both the network and libraries may undergo significant changes before mainnet launch.

- **Current Network**: Testnet (NetworkId.TestNet)
- **Network ID**: 2
- **Stability**: Expect potential breaking changes and updates

### Prerequisites

#### 1. Proof Server Setup

**CRITICAL**: Before using the Midnight integration, you must have a Proof Server running. The Proof Server is required for generating zero-knowledge proofs that are essential for transaction submission on the Midnight blockchain.

Follow the official Midnight documentation to install and launch the proof server:
[**Midnight Proof Server Setup Guide**](https://docs.midnight.stakewith.us/developers/proof-server)

The proof server must be running and accessible at the URL specified in your configuration (`MIDNIGHT_PROOF_SERVER` parameter) before the oracle integration can function properly.

#### 2. Wallet Creation and Funding

The Midnight integration requires a funded wallet to operate. Here's how to set it up:

1. **Create a Wallet**: Generate a private key for your Midnight wallet
2. **Get Testnet DUST Tokens**: You need DUST tokens (Midnight's native token) to pay for transaction fees
3. **Fund Your Wallet**: Transfer DUST tokens to your wallet address

**Note**: The application will automatically wait for funds if your wallet balance is zero when starting.

### How the Midnight Integration Works

The `midnight.ts` file implements a complete oracle feeder for the Midnight blockchain with the following key components:

#### 1. Wallet Management (`buildWalletAndWaitForFunds`)
- **Wallet Creation**: Uses Midnight WalletBuilder to create a wallet with:
  - Indexer endpoints (HTTP and WebSocket)
  - Proof server URL
  - Node endpoint
  - Your secret key
  - Network ID (TestNet)
- **State Monitoring**: Continuously monitors wallet state and balance
- **Funding Detection**: Automatically waits for DUST tokens if wallet is empty

#### 2. Provider Configuration (`configureProviders`)
Sets up all necessary providers for Midnight blockchain interaction:
- **Private State Provider**: LevelDB storage for private state data
- **Public Data Provider**: Midnight indexer connection for public blockchain data
- **ZK Config Provider**: Zero-knowledge proof configurations
- **Proof Provider**: HTTP client for proof generation
- **Wallet Provider**: Wallet-specific functionality
- **Midnight Provider**: Core blockchain interaction layer

#### 3. Contract Management (`joinContract`)
- **Contract Discovery**: Locates the deployed oracle contract using the configured address
- **Contract Joining**: Establishes connection to the oracle contract
- **State Initialization**: Sets up initial private state for the oracle

#### 4. Price Updates (`update`)
- **Batch Processing**: Splits price updates into configurable batches (default: 10 items)
- **Transaction Types**: 
  - Uses `set_multiple_values` for full batches
  - Uses `set_value` for individual updates
- **Error Handling**: Implements retry logic with configurable attempts
- **Confirmation**: Waits for transaction confirmation on the blockchain

### Contract Artifacts and Compilation

The Midnight integration requires specific compiled contract files to function properly. These are stored in the `src/midnight_src/` folder.

#### Folder Structure

```
src/midnight_src/
├── contract/           # Compiled contract artifacts
│   ├── index.cjs      # Main contract implementation
│   ├── index.d.cts    # TypeScript definitions
│   └── index.cjs.map  # Source maps
├── compiler/          # Compiler configuration
│   └── contract-info.json
├── zkir/             # Zero-knowledge proof circuits
│   ├── get_value.zkir
│   ├── set_value.zkir
│   ├── set_multiple_values.zkir
│   ├── change_oracle_updater.zkir
│   └── *.bzkir files (binary format)
└── keys/             # Cryptographic keys for proofs
    ├── *.prover      # Prover keys
    └── *.verifier    # Verifier keys
```

#### Contract Compilation Process

**IMPORTANT**: If the oracle contracts are modified or updated, you must recompile and update the files in the `midnight_src` folder.

1. **Contract Source**: The original contract source code is compiled using the Midnight compiler
2. **Artifact Generation**: The compilation process generates:
   - **Contract Artifacts** (`contract/` folder): JavaScript files that implement the contract logic
   - **ZK Circuits** (`zkir/` folder): Zero-knowledge proof circuits for each contract function
   - **Cryptographic Keys** (`keys/` folder): Prover and verifier keys for proof generation and verification
   - **Type Definitions**: TypeScript definitions for type-safe contract interactions

3. **Integration Requirements**: The `midnight.ts` file reads these compiled artifacts to:
   - Create contract instances
   - Generate zero-knowledge proofs
   - Submit transactions to the blockchain
   - Verify transaction results

#### Updating Contract Artifacts

When contracts are changed, follow these steps:

1. **Recompile Contracts**: Use the Midnight compiler to generate new artifacts
2. **Update Files**: Replace the contents of `src/midnight_src/` with the new compiled files
3. **Verify Integration**: Test that the oracle integration works with the updated contracts
4. **Update Dependencies**: Ensure all related type definitions and witnesses are updated

**Note**: The contract artifacts are tightly coupled with the integration code. Any changes to the contract interface must be reflected in both the compiled artifacts and the TypeScript integration code.

### Configuration Parameters

```properties
# Midnight Configuration
CHAIN_NAME="midnight"

# Network Configuration (Testnet)
MIDNIGHT_NETWORK="2"
MIDNIGHT_NODE="https://rpc.testnet-02.midnight.network"

# Indexer Configuration
MIDNIGHT_INDEXER="https://indexer.testnet-02.midnight.network/api/v1/graphql"
MIDNIGHT_INDEXER_WS="wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws"

# Proof Server (REQUIRED - must be running)
MIDNIGHT_PROOF_SERVER="http://127.0.0.1:6300"

# Wallet and Contract
MIDNIGHT_PRIVATE_KEY="your-private-key-here"
MIDNIGHT_CONTRACT_ADDRESS="deployed-oracle-contract-address"

# Performance Settings
MIDNIGHT_MAX_BATCH_SIZE="10"
MIDNIGHT_MAX_RETRY_ATTEMPTS="3"
```

### Getting Help and Staying Updated

Given the evolving nature of the Midnight network, it's important to stay informed:

- **[Official Midnight Documentation](https://docs.midnight.network/develop/tutorial/)** - Primary source for latest development guides
- **[Midnight Network Homepage](https://midnight.network/)** - Official website with latest announcements
- **[Midnight Discord Community](https://discord.com/invite/midnightnetwork)** - Developer community and support
- **[Midnight Telegram Channel](https://t.me/Midnight_Network_Official)** - Official announcements and updates

**Recommendation**: Join the Discord and Telegram channels to receive timely updates about network changes, library updates, and migration guides.

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

MIDNIGHT_NETWORK="2"
MIDNIGHT_PRIVATE_KEY=""
MIDNIGHT_CONTRACT_ADDRESS=""
MIDNIGHT_INDEXER="https://indexer.testnet-02.midnight.network/api/v1/graphql"
MIDNIGHT_INDEXER_WS="wss://indexer.testnet-02.midnight.network/api/v1/graphql/ws"
# default proof server port is 6300
MIDNIGHT_PROOF_SERVER="http://127.0.0.1:6300"
MIDNIGHT_NODE="https://rpc.testnet-02.midnight.network"

FREQUENCY_SECONDS="120"
MANDATORY_FREQUENCY_SECONDS="0"

DEVIATION_PERMILLE="10"

GQL_WINDOW_SIZE="120"
CONDITIONAL_ASSETS=""
GQL_METHODOLOGY="vwap"
ASSETS=""
GQL_ASSETS="Ethereum-0x6B175474E89094C44Da98b954EedeAC495271d0F-DAI"

LUMINA_ASSETS=""
LUMINA_RPC_URL="https://rpc.diadata.org"
LUMINA_BACKUP_RPC_URL=""
LUMINA_ORACLE_V2_ADDRESS="0x0000000000000000000000000000000000000000"
DATA_AGE_TIMEOUT_SECONDS="0"

COINGECKO_API_KEY=""
COINGECKO_API_URL="https://pro-api.coingecko.com"

CMC_API_KEY=""
CMC_API_URL="https://pro-api.coinmarketcap.com"
```
