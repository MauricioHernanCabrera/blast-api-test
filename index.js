const BigNumber = require("bignumber.js");
const bigintConversion = require("bigint-conversion");
const { chunkPromise, PromiseFlavor } = require("chunk-promise");

const {
  Address,
  ContractFunction,
  SmartContract,
  ResultsParser,
} = require("@elrondnetwork/erdjs/out");
const {
  ApiNetworkProvider,
} = require("@elrondnetwork/erdjs-network-providers/out");

const query = async ({ address, method, args, url }) => {
  const parser = new ResultsParser();

  const apiNetworkProvider = new ApiNetworkProvider(url, {
    timeout: 30_000,
  });

  const contractAddress = new Address(address);
  const contract = new SmartContract({
    address: contractAddress,
  });

  const query = contract.createQuery({
    func: new ContractFunction(method),
    args: args || [],
  });

  const queryResponse = await apiNetworkProvider.queryContract(query);

  return parser.parseUntypedQueryResponse(queryResponse);
};

const BLOCKCHAIN_API_URL = "https://devnet-api.elrond.com";
const BLAST_API_URL =
  "https://elrond-api-devnet.blastapi.io/418251a5-31f5-4f21-8d38-9491009752e0";

const MONEY_MARKET_METHOD = {
  GET_CASH: "getCash",
  GET_TOTAL_RESERVES: "getTotalReserves",
};

const TOKEN_KEYS = {
  EGLD: "EGLD",
  MEX: "MEX",
  RIDE: "RIDE",
  USDC: "USDC",
};

const PROTOCOL_ADDRESS = {
  moneyMarket: {
    EGLD: "erd1qqqqqqqqqqqqqpgqm7ac3tpqm3z46wammaxn5ap0qtpl0falrkksp4vept",
    MEX: "erd1qqqqqqqqqqqqqpgq6ee8tgeq4hcucccxvfv8v3q368tr5ljcrkksn75yww",
    RIDE: "erd1qqqqqqqqqqqqqpgqdk0yjw6d3dmfedf7j4k94qlgdprulwq4rkkslgwl4x",
    USDC: "erd1qqqqqqqqqqqqqpgqtnsfu5vr70tz52k6vx94e7ttn8rdy6nnrkkswrrtv9",
  },
};

const getCash = async ({ tokenKey, url }) => {
  const queryResult = await query({
    address: PROTOCOL_ADDRESS.moneyMarket[tokenKey],
    method: MONEY_MARKET_METHOD.GET_CASH,
    url,
  });

  if (queryResult?.returnCode?.isSuccess?.()) {
    const { values } = queryResult;
    const [uint8ArrValue] = values;
    const bigIntFromBuf = bigintConversion.bufToBigint(
      Uint8Array.from(uint8ArrValue)
    );

    const cash = new BigNumber(bigIntFromBuf).toString();

    return { tokenKey, cash, method: MONEY_MARKET_METHOD.GET_CASH };
  }

  return null;
};

const getTotalReserves = async ({ tokenKey, url }) => {
  const queryResult = await query({
    address: PROTOCOL_ADDRESS.moneyMarket[tokenKey],
    method: MONEY_MARKET_METHOD.GET_TOTAL_RESERVES,
    url,
  });

  if (queryResult?.returnCode?.isSuccess?.()) {
    const { values } = queryResult;
    const [uint8ArrValue] = values;

    const bigIntFromBuf = bigintConversion.bufToBigint(
      Uint8Array.from(uint8ArrValue)
    );
    const totalReserves = new BigNumber(bigIntFromBuf).toString();

    return {
      tokenKey,
      totalReserves,
      method: MONEY_MARKET_METHOD.GET_TOTAL_RESERVES,
    };
  }
  return null;
};

const start = async () => {
  try {
    const blockchainPromises = Object.values(TOKEN_KEYS)
      .map((tokenKey) => [
        () =>
          getCash({
            tokenKey,
            url: BLOCKCHAIN_API_URL,
          }),
        () =>
          getTotalReserves({
            tokenKey,
            url: BLOCKCHAIN_API_URL,
          }),
      ])
      .flat();

    const blockchainData = await chunkPromise(blockchainPromises, {
      promiseFlavor: PromiseFlavor.PromiseAll,
      concurrent: 1,
    });

    const blastApiData = await Promise.all(
      Object.values(TOKEN_KEYS)
        .map((tokenKey) => [
          getCash({
            tokenKey,
            url: BLAST_API_URL,
          }),
          getTotalReserves({
            tokenKey,
            url: BLAST_API_URL,
          }),
        ])
        .flat()
    );

    const mergeData = blockchainData.map(({ tokenKey, method, ...blockchainValues }, index) => {
      const { tokenKey: _, method: __, ...blastApiValues } = blastApiData[index]

      const blockchainValue = Object.values(blockchainValues)[0]
      const blastApiValue = Object.values(blastApiValues)[0]

      return ({
        tokenKey,
        method,
        blockchainValue,
        blastApiValue,
        areEquals: blockchainValue === blastApiValue
      })
    })

    const mergeDataFiltered = mergeData.filter(({ areEquals }) => !areEquals)
    
    console.log(mergeDataFiltered);
  } catch (error) {
    console.log(error);
  }
};

start();
