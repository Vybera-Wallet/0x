#!/bin/bash
export CONFIG_NAME="./truffle-config.js"
source ./scripts/utils/generate_truffle_config.sh

generate_truffle_config "0.6.3" ".\/contracts"

if [ -z $1 ]; then
  node -r dotenv/config ./node_modules/.bin/truffle migrate --network ropsten --skip-dry-run --reset # option key for force re-deploy contracts
else
  node -r dotenv/config ./node_modules/.bin/truffle migrate --network $1 --reset --skip-dry-run # option key for force re-deploy contracts
fi
# remove config file
rm -f $CONFIG_NAME
