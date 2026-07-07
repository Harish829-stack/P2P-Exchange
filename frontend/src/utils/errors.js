export const ERROR_MESSAGES = {
  "0x5ec82351": "Only the seller can perform this action.",
  "0x472e017e": "Only the buyer can perform this action.",
  "0x667f86ef": "Only the arbitrator can perform this action.",
  "0xf525e320": "This action cannot be performed in the current offer status.",
  "0x90b8ec18": "Ether transfer failed.",
  "0x2c5211c6": "Invalid amount provided.",
  "0xafd13cab": "You cannot buy your own offer.",
  "0x9b0056ac": "The lock timeout has not been reached yet.",
  "0xf102cda8": "Arbitrators are not allowed to trade to avoid conflict of interest."
};

export function parseError(err) {
  // If the error object has a direct data property
  if (err.data && ERROR_MESSAGES[err.data]) {
    return ERROR_MESSAGES[err.data];
  }
  
  // If the error object has nested error data (common in ethers v6)
  if (err.info && err.info.error && err.info.error.data && ERROR_MESSAGES[err.info.error.data]) {
    return ERROR_MESSAGES[err.info.error.data];
  }
  
  if (err.error && err.error.data && ERROR_MESSAGES[err.error.data]) {
    return ERROR_MESSAGES[err.error.data];
  }
  
  // Fallback: extract the data string using regex from stringified error
  try {
    const errString = JSON.stringify(err);
    const dataMatch = errString.match(/"data":"(0x[0-9a-fA-F]+)"/);
    if (dataMatch && ERROR_MESSAGES[dataMatch[1]]) {
      return ERROR_MESSAGES[dataMatch[1]];
    }
  } catch (e) {
    // Ignore stringify errors
  }

  // Fallback to reason, shortMessage or a default message
  return err.reason || err.shortMessage || 'Transaction failed. Check console for details.';
}
