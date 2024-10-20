// workers/transactionProcessor.ts
import Queue from "bull";
import { sendNotification } from "../utils/notifications";
import { BloomFilter } from "bloom-filters";
import { tronWeb } from "../shared";
import { WatchedAddress } from "../models/WatchedAddress";
import mongoose from "mongoose";

// Bloom filter and exact address set
export let bloom: BloomFilter;
export let exactAddressSet: Set<string>;

const MONGODB_URI = "mongodb://localhost:27017/tron-monitor";

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    await loadWatchedAddresses();
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

const loadWatchedAddresses = async () => {
  const watchedAddresses = await WatchedAddress.find().lean();
  const addresses = watchedAddresses.map((doc) => doc.address);

  // Calculate Bloom Filter parameters
  const n = addresses.length || 1;
  const p = 0.01;
  const m = Math.ceil((-n * Math.log(p)) / Math.log(2) ** 2);
  const k = Math.ceil((m / n) * Math.log(2));

  // Initialize Bloom Filter
  bloom = new BloomFilter(m, k);
  addresses.forEach((address) => {
    bloom.add(address);
  });

  exactAddressSet = new Set<string>(addresses);
};

// Initialize Redis connection for Bull
const REDIS_URL = "redis://127.0.0.1:6379";

const transactionQueue = new Queue("transactionQueue", REDIS_URL);

setInterval(async () => {
  await loadWatchedAddresses();
  console.log("Watch Addresses Updated");
}, 10000);

let count = 0;

// Process transactions
transactionQueue.process(async (job) => {
  const tx = job.data;
  await processTransaction(tx);
  count++;
  console.log("count: %d", count);
});

// Function to check if an address is monitored
const isMonitoredAddress = (address: string): boolean => {
  if (bloom.has(address)) {
    return exactAddressSet.has(address);
  }
  return false;
};

// Process individual transaction
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

      if (isMonitoredAddress(toAddress)) {
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
        } catch (error: any) {
          console.error(`Error decoding transaction ${txId}:`, error.message);
        }
      }
    }
  }
};
