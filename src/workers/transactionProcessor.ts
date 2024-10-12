// workers/transactionProcessor.ts
import Queue from "bull";
import { tronWeb, bloom, exactAddressSet } from "../monitor";
import { sendNotification } from "../utils/notifications";

// Initialize Redis connection for Bull
const REDIS_URL = "redis://127.0.0.1:6379";

const transactionQueue = new Queue("transactionQueue", REDIS_URL);

// Process transactions
transactionQueue.process(async (job) => {
  const tx = job.data;
  await processTransaction(tx);
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
