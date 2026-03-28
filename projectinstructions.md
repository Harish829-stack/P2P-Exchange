# Project Instructions: P2P Escrow Exchange

## Project Overview
A decentralized P2P exchange where users can trade assets. A Smart Contract acts as the escrow, holding funds until both parties fulfill the trade or a timeout occurs.

## Technical Stack
- **Framework:** Hardhat (Blockchain) + React (Frontend)
- **Languages:** Solidity (0.8.20+), JavaScript
- **Libraries:** Ethers.js v6, Tailwind CSS
- **Wallet:** MetaMask integration required

## Agent Roles & Specific Tasks

### Claude Agent (Smart Contract & Backend Specialist)
1. **Security First:** Ensure the `P2PExchange.sol` uses `ReentrancyGuard` and proper access controls (Ownable).
2. **State Management:** Design a `struct Offer` that tracks `seller`, `amount`, `price`, and `status` (Open, Locked, Completed, Cancelled).
3. **Smart Accounts:** Implement logic compatible with ERC-4337 if the user opts for Account Abstraction features later.
4. **Hardhat Config:** Set up the network configurations for Sepolia and local node.

### Gemini Agent (Frontend & UI Specialist)
1. **Component Design:** Build a clean, dark-mode inspired UI using React.
2. **Ethers Integration:** Create a `useWeb3` hook to handle connecting wallets, switching networks, and fetching contract data.
3. **Real-time Feedback:** Use "Loading Toasts" or progress bars for blockchain transactions (since they take time to mine).
4. **Data Fetching:** Optimize fetching of "Active Offers" from the contract using `provider.getLogs` or direct view functions.

## Development Rules
- **No Hardcoding:** All contract addresses and environment variables must stay in `.env`.
- **Modularity:** Keep the ABI and Contract Address in a central `constants.js` file for the frontend to access easily.
- **Clean Code:** Use descriptive variable names and provide comments for every Solidity function.