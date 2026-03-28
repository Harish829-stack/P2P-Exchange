# P2P Escrow Frontend Implementation Guide

This document outlines the architecture and provides a step-by-step guide for building a React.js frontend integrated with the existing P2P Escrow and Multisig Arbitrator smart contracts using `ethers.js`.

## 1. Tech Stack
- **Framework:** React.js (via Vite or Next.js)
- **Web3 Library:** `ethers.js` (v6)
- **Styling:** CSS / Tailwind CSS (per your preference)
- **Blockchain Environment:** Localhost (Hardhat) / Testnet sepolia

---

## 2. Project Initialization
Start by creating a new React project in the root of your workspace (`/home/harish/Desktop/Hackathon`):

```bash
npx create-vite@latest frontend --template react
cd frontend
npm install
npm install ethers
```

---

## 3. Wallet Integration (ethers.js v6)
You need a system to connect user wallets (MetaMask). Create a custom hook (e.g., `src/hooks/useWallet.js`) to manage the provider, signer, and account state.

```javascript
import { useState } from 'react';
import { ethers } from 'ethers';

export const useWallet = () => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        // Request account access
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Ethers v6 standard provider 
        const tempProvider = new ethers.BrowserProvider(window.ethereum);
        const tempSigner = await tempProvider.getSigner();
        const tempAddress = await tempSigner.getAddress();
        
        setProvider(tempProvider);
        setSigner(tempSigner);
        setAddress(tempAddress);
      } catch (err) {
        console.error("Wallet connection failed:", err);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  return { provider, signer, address, connectWallet };
};
```

---

## 4. Smart Contract Connections
Your `deploy.js` script correctly exports all necessary data (addresses and ABIs) to `blockchain/deployments/<network>.json`. You can securely import this JSON into your frontend.

Create `src/utils/contracts.js`:

```javascript
import deployments from '../../blockchain/deployments/localhost.json'; // Adjust path if using another network
import { ethers } from 'ethers';

export const getP2PEscrowContract = (signerOrProvider) => {
    return new ethers.Contract(
        deployments.contracts.P2PEscrow.address, 
        deployments.contracts.P2PEscrow.abi, 
        signerOrProvider
    );
};

export const getMultisigContract = (signerOrProvider) => {
    return new ethers.Contract(
        deployments.contracts.MultisigArbitrator.address, 
        deployments.contracts.MultisigArbitrator.abi, 
        signerOrProvider
    );
};
```

---

## 5. Escrow Functionalities & Implementation

### A. List an Offer (Seller)
Allows a Seller to create an escrow offer by depositing ETH. 
*Note: `msg.value` handles the ETH deposit, while `fiatPriceCents` is passed as an argument.*

```javascript
const listOffer = async (ethAmount, fiatPriceCents) => {
    const escrow = getP2PEscrowContract(signer);
    const value = ethers.parseEther(ethAmount.toString()); 
    
    // Call listOffer(uint256 fiatPriceCents) payable
    const tx = await escrow.listOffer(fiatPriceCents, { value });
    await tx.wait();
    console.log("Offer successfully listed!");
};
```

### B. View and Accept Offer (Buyer)
Buyers will click "Accept" on an open offer, changing its status to `Locked`.

```javascript
const acceptOffer = async (offerId) => {
    const escrow = getP2PEscrowContract(signer);
    const tx = await escrow.acceptOffer(offerId);
    await tx.wait();
    console.log("Offer accepted. It is now locked!");
};
```

### C. Release Funds (Seller)
Once the Buyer has transferred the fiat amount externally, the Seller releases the locked ETH.

```javascript
const releaseFunds = async (offerId) => {
    const escrow = getP2PEscrowContract(signer);
    const tx = await escrow.releaseFunds(offerId);
    await tx.wait();
    console.log("Funds moved to buyer's withdrawable balance.");
};
```

### D. Dispute Management
Allows Buyer or Seller to lock the trade via Arbitrator if a disagreement happens.

```javascript
const openDispute = async (offerId) => {
    const escrow = getP2PEscrowContract(signer);
    const tx = await escrow.openDispute(offerId);
    await tx.wait();
    console.log("Dispute opened. Awaiting Arbitrator resolution.");
};
```

### E. Withdraw Funds (Pull Payment)
Because the contract uses the *Pull Payment Pattern*, released/refunded funds accumulate in the `withdrawable` mapping instead of being sent immediately. Provide a generic "Withdraw" button in the app navbar.

```javascript
const withdrawFunds = async () => {
    const escrow = getP2PEscrowContract(signer);
    const tx = await escrow.withdraw();
    await tx.wait();
    console.log("ETH successfully withdrawn to your wallet");
};
```

---

## 6. Multisig Arbitrator Flow
You should build an "Admin Panel" for Arbitrators (the 3 owners). 

1. **Submit Transaction (Propose Resolution):** One multisig owner packages the `resolveDispute` call.
```javascript
// Example pseudo-code for calling Multisig
const escrowInterface = new ethers.Interface(deployments.contracts.P2PEscrow.abi);
// encode function data for resolveDispute(offerId, releaseToBuyer)
const data = escrowInterface.encodeFunctionData("resolveDispute", [offerId, true]);

const multisig = getMultisigContract(signer);
const submitTx = await multisig.submitTx(deployments.contracts.P2PEscrow.address, 0, data);
```

2. **Approve & Execute:** Other owners will trigger `approveTx(txId)`. Once the threshold (2 approvals) is reached, an owner triggers `executeTx(txId)`.

---

## 7. Recommended Initial Architecture 

```text
frontend/
├── src/
│   ├── components/
│   │   ├── Navbar.jsx          (Holds connect wallet & withdraw buttons)
│   │   ├── CreateOffer.jsx     (Form to call listOffer)
│   │   ├── OfferList.jsx       (Fetches and maps over getOffer/getStatus)
│   │   └── OfferCard.jsx       (Displays individual offer + Accept/Release buttons)
│   ├── hooks/
│   │   └── useWallet.js
│   ├── utils/
│   │   └── contracts.js
│   └── App.jsx
```

### How to fetch all offers:
Because there's no native `getAllOffers` function, fetch `nextOfferId` from the contract, then loop and fetch details for IDs from `0` to `nextOfferId - 1`.

```javascript
const fetchOffers = async () => {
    const escrow = getP2PEscrowContract(provider);
    const totalOffers = await escrow.nextOfferId();
    
    let allOffers = [];
    for(let i = 0; i < Number(totalOffers); i++) {
        const offer = await escrow.getOffer(i);
        const status = await escrow.getStatus(i);
        allOffers.push({ id: i, ...offer, statusName: status });
    }
    return allOffers;
};
```
