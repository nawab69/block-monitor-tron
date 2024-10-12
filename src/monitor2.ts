// monitor.ts
import { TronWeb } from "tronweb";
import { BloomFilter } from "bloom-filters";
import { monitoredAddresses } from "./monitoredAddresses";

// Calculate Bloom Filter parameters
const n = monitoredAddresses.length; // Number of addresses
const p = 0.01; // False-positive probability (1%)
const m = Math.ceil((-n * Math.log(p)) / Math.log(2) ** 2); // Bit array size
const k = Math.ceil((m / n) * Math.log(2)); // Number of hash functions

// Initialize Bloom Filter
const bloom = new BloomFilter(m, k);
monitoredAddresses.forEach((address) => {
  bloom.add(address);
});
const exactAddressSet = new Set<string>(monitoredAddresses);

// Configure TronWeb
const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
});

let lastBlockNumber = 65992300;

const pollNewBlocks = async () => {
  try {
    const currentBlock = await tronWeb.trx.getCurrentBlock();
    const currentBlockNumber = currentBlock.block_header.raw_data.number;

    console.log({ currentBlockNumber, lastBlockNumber });

    if (currentBlockNumber > lastBlockNumber) {
      for (
        let blockNumber = lastBlockNumber + 1;
        blockNumber <= currentBlockNumber;
        blockNumber++
      ) {
        console.log(`Processing block: ${blockNumber}`);
        await processBlock(blockNumber);
      }
      lastBlockNumber = currentBlockNumber;
    }
  } catch (error) {
    console.error("Error polling new blocks:", error);
  }
};

const processBlock = async (blockNumber: number) => {
  try {
    const block = await tronWeb.trx.getBlock(blockNumber);
    const transactions = block.transactions || [];

    // console.log("Block Number", blockNumber);
    // console.log("Transactions", transactions);

    for (const tx of transactions) {
      await processTransaction(tx);
    }
  } catch (error) {
    console.error(`Error processing block ${blockNumber}:`, error);
  }
};

const processTransaction = async (tx: any) => {
  const txId = tx.txID;
  const rawData = tx.raw_data;
  const contracts = rawData.contract;

  for (const contract of contracts) {
    const type = contract.type;
    const parameter = contract.parameter.value;

    if (type === "TransferContract") {
      // TRX Transfer
      const toAddress = tronWeb.address.fromHex(parameter.to_address);
      const fromAddress = tronWeb.address.fromHex(parameter.owner_address);
      const amount = parameter.amount;

      if (isMonitoredAddress(toAddress) || isMonitoredAddress(fromAddress)) {
        sendNotification({
          toAddress,
          fromAddress,
          amount: (amount / 1_000_000).toString(),
          txId,
        });
      }
    } else if (type === "TriggerSmartContract") {
      // Possible TRC20 Transfer
      const contractAddress = tronWeb.address.fromHex(
        parameter.contract_address
      );

      const data = parameter.data;

      if (data && data.startsWith("a9059cbb")) {
        try {
          const splitedData = data.split("");
          splitedData[30] = "0"; // remove '4'
          splitedData[31] = "0"; // remove '1'
          // Decode parameters
          const decoded = tronWeb.utils.abi.decodeParams(
            ["_to", "_value"],
            ["address", "uint256"],
            "0x" + splitedData?.join("")?.substring(8),
            true
          );

          const toAddress = tronWeb.address.fromHex(decoded._to);
          const amount = BigInt(decoded._value).toString();

          if (isMonitoredAddress(toAddress)) {
            sendNotification({
              toAddress,
              fromAddress: "N/A",
              amount,
              txId,
              tokenAddress: contractAddress,
            });
          }
        } catch (e) {
          console.error("Error decoding", txId, data);
        }
      }
    }
  }
};

const isMonitoredAddress = (address: string): boolean => {
  if (bloom.has(address)) {
    return exactAddressSet.has(address);
  }
  return false;
};

const sendNotification = (data: {
  toAddress: string;
  fromAddress: string;
  amount: string;
  txId: string;
  tokenAddress?: string;
}) => {
  const { toAddress, fromAddress, amount, txId, tokenAddress } = data;

  if (tokenAddress) {
    console.log(`TRC20 Token Transfer Alert:
      TX ID: ${txId}
      Token Address: ${tokenAddress}
      To: ${toAddress}
      Amount: ${amount}
    `);
  } else {
    console.log(`TRX Transfer Alert:
      TX ID: ${txId}
      From: ${fromAddress}
      To: ${toAddress}
      Amount: ${amount} TRX
    `);
  }
};

console.log("Starting Tron monitoring service...");
// setInterval(pollNewBlocks, 3000);

pollNewBlocks();
