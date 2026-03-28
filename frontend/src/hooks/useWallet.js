import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import { CHAIN_ID } from '../utils/contracts';

const SEPOLIA_CHAIN_HEX = '0x' + CHAIN_ID.toString(16); // '0xaa36a7'

export const useWallet = () => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWrongNetwork, setIsWrongNetwork] = useState(false);

  const connectWallet = useCallback(async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('Please install MetaMask!');
      return;
    }

    setIsConnecting(true);
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      const tempProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await tempProvider.getNetwork();
      const cId = Number(network.chainId);

      if (cId !== CHAIN_ID) {
        setIsWrongNetwork(true);
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: SEPOLIA_CHAIN_HEX }],
          });
        } catch (switchErr) {
          if (switchErr.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: SEPOLIA_CHAIN_HEX,
                chainName: 'Sepolia Testnet',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://rpc.sepolia.org'],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              }],
            });
          }
        }
      }

      // Re-read after potential switch
      const freshProvider = new ethers.BrowserProvider(window.ethereum);
      const tempSigner = await freshProvider.getSigner();
      const tempAddress = await tempSigner.getAddress();
      const freshNetwork = await freshProvider.getNetwork();

      setProvider(freshProvider);
      setSigner(tempSigner);
      setAddress(tempAddress.toLowerCase());
      setChainId(Number(freshNetwork.chainId));
      setIsWrongNetwork(Number(freshNetwork.chainId) !== CHAIN_ID);
    } catch (err) {
      console.error('Wallet connection failed:', err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnectWallet = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAddress(null);
    setChainId(null);
    setIsWrongNetwork(false);
  }, []);

  // Listen for account / chain changes
  useEffect(() => {
    if (!window.ethereum) return;

    const onAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        setAddress(accounts[0].toLowerCase());
        // re-get signer
        if (provider) {
          provider.getSigner().then(setSigner).catch(disconnectWallet);
        }
      }
    };

    const onChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on('accountsChanged', onAccountsChanged);
    window.ethereum.on('chainChanged', onChainChanged);

    return () => {
      window.ethereum.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum.removeListener('chainChanged', onChainChanged);
    };
  }, [provider, disconnectWallet]);

  return {
    provider,
    signer,
    address,
    chainId,
    isConnecting,
    isWrongNetwork,
    connectWallet,
    disconnectWallet,
  };
};
