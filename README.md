# ETH+ERC20+EIP3009+TransferTools

Node.JS API for transfer of ETH + ERC20, delegated (gasless) transfer via EIP-3009 as supported by USDC, and misc functions. Also includes full unit test for transfer functions.


## Testing

Testing was done with a private Ethereum network, based on the genesis block defined in test/CustomGenesis.json.

The code tested with is in test/test.js. It deploys a test token with EIP-3009 support and does transfers of ETH and the test token between addresses.


## API

Please see test/test.js on how the API can be called.