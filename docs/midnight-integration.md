# Midnight Integration Documentation

## Overview

The Midnight integration provides a complete oracle feeder implementation for the Midnight blockchain. It enables price data submission to smart contracts using Midnight's privacy-focused infrastructure with zero-knowledge proofs.

## Prerequisites

### Testnet Status

**IMPORTANT**: This integration is currently configured for **Midnight Testnet**. The Midnight network is still in development, and both the network and libraries may undergo significant changes before mainnet launch.

- **Current Network**: Testnet
- **Network ID**: TestNet (NetworkId.TestNet)
- **Stability**: Expect potential breaking changes and updates

### Proof Server Setup

**IMPORTANT**: Before using the Midnight integration, you must have a Proof Server running. The Proof Server is required for generating zero-knowledge proofs that are essential for transaction submission on the Midnight blockchain.

#### Installation and Setup

Follow the official Midnight documentation to install and launch the proof server:

[**Midnight Proof Server Setup Guide**](https://docs.midnight.stakewith.us/developers/proof-server)

The proof server must be running and accessible at the URL specified in your configuration (`proofServer` parameter) before the oracle integration can function properly.

### Staying Updated

Given the evolving nature of the Midnight network, it's important to stay informed about updates and changes:

- **[Official Midnight Documentation](https://docs.midnight.network/develop/tutorial/)** - Primary source for latest development guides and tutorials
- **[Midnight Network Homepage](https://midnight.network/)** - Official website with latest announcements and updates
- **[Midnight Discord Community](https://discord.com/invite/midnightnetwork)** - Developer community and support
- **[Midnight Telegram Channel](https://t.me/Midnight_Network_Official)** - Official announcements and updates

**Recommendation**: Join the Discord and Telegram channels to receive timely updates about network changes, library updates, and migration guides.

## Architecture

The Midnight integration consists of several key components:

1. **Wallet Management** - Handles wallet creation, funding, and state management
2. **Provider Configuration** - Sets up various providers for blockchain interaction
3. **Contract Interaction** - Manages oracle contract deployment and updates
4. **Batch Processing** - Handles efficient price updates in batches

## Key Components

### 1. Wallet Initialization (`buildWalletAndWaitForFunds`)

The wallet initialization process:

- **Wallet Creation**: Builds a wallet using the Midnight WalletBuilder with configuration from:
  - Indexer endpoints (HTTP and WebSocket)
  - Proof server URL
  - Node endpoint
  - Secret key for authentication
  - Network ID (Zswap network)

- **State Management**: 
  - Starts the wallet and monitors its state
  - Displays wallet address and balance
  - Waits for initial funding if balance is zero

- **Funding Detection**: Uses RxJS observables to monitor wallet state changes and detect when funds are received

### 2. Provider Configuration (`configureProviders`)

Sets up all necessary providers for Midnight blockchain interaction:

- **Private State Provider**: Uses LevelDB for storing private state data
- **Public Data Provider**: Connects to Midnight indexer for public blockchain data
- **ZK Config Provider**: Manages zero-knowledge proof configurations
- **Proof Provider**: Handles proof generation via HTTP client
- **Wallet Provider**: Provides wallet-specific functionality
- **Midnight Provider**: Core Midnight blockchain interaction layer

### 3. Contract Management (`joinContract`)

Handles oracle contract instantiation:

- **Contract Discovery**: Uses `findDeployedContract` to locate the deployed oracle contract
- **Address Configuration**: Uses contract address from configuration
- **State Initialization**: Sets up initial private state with empty keys and updater
- **Contract Instance**: Creates a deployed contract instance for interaction

### 4. Price Update Process (`update`)

The core functionality for submitting price data:

#### Batch Processing
- **Input Validation**: Accepts arrays of keys (asset symbols) and corresponding prices
- **Batch Splitting**: Divides large updates into manageable batches based on `maxBatchSize` configuration
- **Timestamp Generation**: Creates timestamps for each price update

#### Transaction Types
- **Batch Updates**: For full batches (10 items), uses `set_multiple_values` for efficiency
- **Individual Updates**: For smaller batches, uses individual `set_value` calls

#### Error Handling
- **Retry Logic**: Implements configurable retry attempts for failed transactions
- **Error Logging**: Comprehensive error reporting and logging
- **Transaction Confirmation**: Waits for transaction confirmation and block inclusion

### 5. Contract Artifacts and Dependencies

The Midnight integration requires specific contract artifacts and type definitions to function properly:

#### Required Folder Structure

```
├── packages/
│   └── common/
│       └── src/
│           └── midnight/          # Contract types and utilities
│               ├── ts/
│               │   ├── index.ts
│               │   └── witnesses.ts
│               └── managed/
│                   └── oracle/
│                       └── contract/
│                           └── index.d.cts
└── apps/
    └── oracle/
        └── src/
            └── midnight_src/      # Oracle contract artifacts
                └── contract/
                    └── index.d.cts
```

#### Contract Artifacts

The integration reads the oracle contract through:

1. **`packages/common/src/midnight/`** - Contains:
   - Type definitions for the oracle contract
   - Witness generation code
   - Contract interaction utilities
   - Transaction submission logic

2. **`apps/oracle/src/midnight_src/`** - Contains:
   - Oracle contract artifacts (compiled contract code)
   - Contract interface definitions
   - Zero-knowledge proof configurations

#### Contract Updates

**IMPORTANT**: If the oracle contract is modified or updated, you must:

1. **Update Contract Artifacts**: Copy the new contract artifacts to `apps/oracle/src/midnight_src/contract/`
2. **Update Type Definitions**: Update the files in `packages/common/src/midnight/` to match the new contract interface
3. **Regenerate Witnesses**: If the contract logic changes, regenerate the witness files
4. **Test Integration**: Verify that the integration works with the updated contract

#### Contract Reading Process

The integration reads the contract through the following flow:

1. **Contract Instance Creation**: Uses `Oracle.Contract(witnesses)` to create a contract instance
2. **Contract Discovery**: Uses `findDeployedContract()` to locate the deployed contract on the blockchain
3. **Type Safety**: Leverages TypeScript definitions to ensure type-safe contract interactions
4. **Transaction Building**: Uses contract artifacts to build and submit transactions

**Note**: The contract artifacts and type definitions are tightly coupled. Any changes to the contract must be reflected in both locations to maintain functionality.

## Configuration

The integration requires several configuration parameters:

```typescript
const config = {
  midnight: {
    indexer: "https://indexer.testnet.midnight.stakewith.us",
    indexerWS: "wss://indexer.testnet.midnight.stakewith.us",
    proofServer: "https://prover.testnet.midnight.stakewith.us", // REQUIRED: Must have proof server running
    node: "https://node.testnet.midnight.stakewith.us",
    seed: "your-secret-key",
    network: "2", // TestNet - NOTE: This is for testnet only
    contractAddress: "deployed-contract-address",
    maxBatchSize: 10,
    maxRetryAttempts: 3
  }
}
```

**Note**: The `proofServer` parameter is critical for the integration to function. Ensure you have followed the [Proof Server Setup Guide](https://docs.midnight.network/develop/tutorial/using/proof-server) and have the proof server running before attempting to use this integration.

**Testnet Warning**: This configuration is specifically for Midnight Testnet. The network endpoints, library APIs, and contract interfaces may change as Midnight progresses toward mainnet. Always refer to the [official documentation](https://docs.midnight.network/develop/tutorial/) for the latest updates.

## Workflow

### Initialization Flow
1. **Network Setup**: Sets Midnight network ID to TestNet
2. **Wallet Creation**: Builds and starts wallet, waits for funding
3. **Provider Setup**: Configures all necessary providers
4. **Contract Joining**: Locates and joins the deployed oracle contract

### Update Flow
1. **Data Preparation**: Receives arrays of keys and prices
2. **Batch Processing**: Splits data into configurable batch sizes
3. **Transaction Creation**: Creates appropriate transaction type based on batch size
4. **Submission**: Submits transactions to the blockchain
5. **Confirmation**: Waits for transaction confirmation
6. **Error Handling**: Retries failed transactions up to configured limit

## Key Features

### Privacy-First Design
- Uses Midnight's zero-knowledge proof infrastructure
- Private state management for sensitive data
- Encrypted transaction handling

### Scalability
- Batch processing for efficient updates
- Configurable batch sizes
- Retry mechanisms for reliability

### Monitoring
- Comprehensive logging throughout the process
- Transaction status tracking
- Error reporting and debugging information

### Network Compatibility
- TestNet support
- Configurable network endpoints
- WebSocket and HTTP connectivity

## Dependencies

The integration relies on several Midnight-specific packages:

- `@midnight-ntwrk/midnight-js-network-id` - Network identification
- `@midnight-ntwrk/wallet-api` - Wallet management
- `@midnight-ntwrk/midnight-js-types` - Type definitions
- `@midnight-ntwrk/midnight-js-indexer-public-data-provider` - Public data access
- `@midnight-ntwrk/midnight-js-level-private-state-provider` - Private state storage
- `@midnight-ntwrk/midnight-js-node-zk-config-provider` - ZK proof configuration
- `@midnight-ntwrk/midnight-js-http-client-proof-provider` - Proof generation
- `@midnight-ntwrk/midnight-js-contracts` - Contract management

## Usage Example

```typescript
// Initialize the Midnight oracle
await init();

// Update prices
const keys = ['BTC', 'ETH', 'SOL'];
const prices = [45000, 3000, 100];
await update(keys, prices);
```

## Known Issues

### Network ID Configuration

**Issue**: If the network ID is not set correctly in the configuration, the integration may fail without returning a clear error message when attempting to join a contract.

**Problem**: When the library uses the default network ID (0) instead of the correct testnet ID (2), it will attempt to connect to the wrong network. Since the oracle contract is deployed on testnet (network ID 2), the integration will fail to locate the contract, but the error message may not clearly indicate that the network ID is incorrect.

**Solution**: Always ensure the network ID is explicitly set to the correct value in your configuration:

## Error Handling

The integration includes robust error handling:

- **Network Failures**: Automatic retry with exponential backoff
- **Transaction Failures**: Configurable retry attempts
- **State Synchronization**: Waits for wallet sync before proceeding
- **Funding Detection**: Monitors for incoming funds

## Security Considerations

- **Private Key Management**: Secure handling of wallet private keys
- **State Encryption**: Private state is encrypted and stored securely
- **Proof Generation**: Zero-knowledge proofs ensure privacy
- **Network Security**: Uses secure connections to Midnight nodes

This integration provides a complete, production-ready solution for feeding price data to Midnight oracle contracts while maintaining the privacy and security features that make Midnight unique. 
