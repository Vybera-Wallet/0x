#!/bin/bash
export CONFIG_NAME="./truffle-config.js"
source ./scripts/utils/generate_truffle_config.sh

generate_truffle_config "0.6.3" ".\/contracts"

if [ -z $1 ]; then
  truffle run verify ExchangeZRX --network ropsten
else
  if [ -z $2 ]; then
    truffle run verify $1 --network ropsten
  else
    if [[ $1 = "all" ]]; then
      truffle run verify ExchangeZRX@0xb55E3D6438C4Cb0d952Bc7b8a71fAB14Cc763519 --forceConstructorArgs string:0000000000000000000000000000000000000000000000000000000000000064000000000000000000000000def1c0ded9bec7f1a1670819833240f027b25eff000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2 --network $2
    else
      truffle run verify $1 --network $2
    fi
  fi
fi

# remove config file
rm -f $CONFIG_NAME
