// monitor.ts
import { TronWeb } from "tronweb";
import mongoose from "mongoose";
import { BloomFilter } from "bloom-filters";
import { WatchedAddress } from "./models/WatchedAddress";
import Queue from "bull";
import { BlockState } from "./models/BlockState";

// Initialize TronWeb
export const tronWeb = new TronWeb({
  fullHost: "https://api.trongrid.io",
});

// Initialize Redis connection for Bull
const REDIS_URL = "redis://127.0.0.1:6379"; // Replace with your Redis URL

export const transactionQueue = new Queue("transactionQueue", REDIS_URL);

// Bloom filter and exact address set
export let bloom: BloomFilter;
export let exactAddressSet: Set<string>;
let lastBlockNumber: number;

const MONGODB_URI = "mongodb://localhost:27017/tron-monitor";

mongoose
  .connect(MONGODB_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    await loadWatchedAddresses();
    await loadLastBlockNumber();
    startMonitoring(); // Start monitoring after loading addresses
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

const loadLastBlockNumber = async () => {
  const blockState = await BlockState.findById("singleton").lean();
  if (blockState && blockState.lastBlockNumber) {
    lastBlockNumber = blockState.lastBlockNumber;
    console.log(`Resuming from block number ${lastBlockNumber}`);
  } else {
    // If no block state is found, start from the latest block
    const currentBlock = await tronWeb.trx.getCurrentBlock();
    lastBlockNumber = currentBlock.block_header.raw_data.number;
    console.log(`Starting from current block number ${lastBlockNumber}`);

    // Save initial block state to MongoDB
    await BlockState.create({ _id: "singleton", lastBlockNumber });
  }
};

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

const pollNewBlocks = async () => {
  try {
    const currentBlock = await tronWeb.trx.getCurrentBlock();
    const currentBlockNumber = currentBlock.block_header.raw_data.number;

    if (currentBlockNumber > lastBlockNumber) {
      for (
        let blockNumber = lastBlockNumber + 1;
        blockNumber <= currentBlockNumber;
        blockNumber++
      ) {
        console.log(`Processing block: ${blockNumber}`);
        await processBlock(blockNumber);

        lastBlockNumber = blockNumber;
        await updateLastBlockNumber(blockNumber);
      }
    }
  } catch (error) {
    console.error("Error polling new blocks:", error);
  }
};

const updateLastBlockNumber = async (blockNumber: number) => {
  try {
    await BlockState.findByIdAndUpdate(
      "singleton",
      { lastBlockNumber: blockNumber },
      { upsert: true }
    );
  } catch (error) {
    console.error(`Error updating lastBlockNumber to ${blockNumber}:`, error);
  }
};

const processBlock = async (blockNumber: number) => {
  try {
    const block = await tronWeb.trx.getBlock(blockNumber);
    const transactions = block.transactions || [];

    for (const tx of transactions) {
      // Add transaction to Bull queue
      await transactionQueue.add(tx);
    }
  } catch (error) {
    console.error(`Error processing block ${blockNumber}:`, error);
  }
};

const startMonitoring = () => {
  console.log("Starting Tron monitoring service...");
  setInterval(pollNewBlocks, 3000);
};

// Start the transaction processor worker
import "./workers/transactionProcessor";
