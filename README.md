# DIA Soroban data feeders

This monorepo contains data feeder scripts for DIA Soroban oracles. You can find more details about every data feeder in the `apps` folder.

## Restart Policy

The oracle feeder is built under the assumption that the origin data API returns a valid response. If any error is found within requesting the API, the feeder exits and should be run in an environment where it is restarted automatically.
The default docker-compose setup is ensuring such an automatic restart.

## Deployment

The easiest way to build and deploy oracle feeders is with `docker-compose`. Environment configuration files should be placed in the corresponding app directory (e.g. `apps/oracle/.env`).

### Requirements

- [Docker 20.0+](https://www.docker.com)
- [docker-compose v2](https://docs.docker.com/compose)

To build and run all data feeders:

```sh
docker-compose build

docker-compose up -d
```

## Development

This monorepo uses [Turborepo](https://turbo.build) to manage build pipelines and shared dependencies. Before continuing, make sure these dependencies are installed:

- [Node.js 20.x](https://nodejs.org)
- [Yarn](https://yarnpkg.com)

Available scripts:

```sh
# Build all apps and packages
yarn build

# Remove build artifacts
yarn clean

# Run feeders with ts-node
yarn dev

# Format all files with Prettier
yarn format
```
