import sepoliaDeployments from '../../../blockchain/deployments/sepolia.json';
import { ethers } from 'ethers';

// Use Sepolia live deployment
const deployments = sepoliaDeployments;

export const ESCROW_ADDRESS = deployments.contracts.P2PEscrow.address;
export const MULTISIG_ADDRESS = deployments.contracts.MultisigArbitrator.address;
export const ESCROW_ABI = deployments.contracts.P2PEscrow.abi;
export const MULTISIG_ABI = deployments.contracts.MultisigArbitrator.abi;
export const CHAIN_ID = deployments.chainId; // 11155111 = Sepolia

export const getP2PEscrowContract = (signerOrProvider) => {
    return new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, signerOrProvider);
};

export const getMultisigContract = (signerOrProvider) => {
    return new ethers.Contract(MULTISIG_ADDRESS, MULTISIG_ABI, signerOrProvider);
};

export const STATUS_MAP = {
    0: 'Open',
    1: 'Locked',
    2: 'Completed',
    3: 'Cancelled',
    4: 'Disputed',
};

export const formatAddress = (addr) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

export const formatEth = (wei) => {
    try {
        return parseFloat(ethers.formatEther(wei)).toFixed(4);
    } catch {
        return '0.0000';
    }
};

export const formatUSD = (cents) => {
    try {
        return (Number(cents) / 100).toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
        });
    } catch {
        return '$0.00';
    }
};
