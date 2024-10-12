// utils/notifications.ts
export const sendNotification = (data: {
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
      From: ${fromAddress}
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

  // Implement actual notification logic here (email, SMS, webhook, etc.)
};
