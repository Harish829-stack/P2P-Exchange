import { Wallet, LogOut, Download, ExternalLink, Shield, ChevronDown } from 'lucide-react';
import { getP2PEscrowContract, formatAddress, ESCROW_ADDRESS, MULTISIG_ADDRESS } from '../utils/contracts';
import { useToast } from './Toast';
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Link, useLocation } from 'react-router-dom';

export const Navbar = ({ provider, signer, address, connectWallet, disconnectWallet, isConnecting, isWrongNetwork }) => {
  const toast = useToast();
  const location = useLocation();
  const [withdrawable, setWithdrawable] = useState(0n);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Fetch withdrawable balance
  useEffect(() => {
    if (!provider || !address) { setWithdrawable(0n); return; }
    const fetchBalance = async () => {
      try {
        const escrow = getP2PEscrowContract(provider);
        const bal = await escrow.withdrawable(address);
        setWithdrawable(bal);
      } catch { /* silent */ }
    };
    fetchBalance();
    const interval = setInterval(fetchBalance, 15000);
    return () => clearInterval(interval);
  }, [provider, address]);

  const withdrawFunds = async () => {
    if (!signer) { toast.warning('Please connect your wallet first'); return; }
    if (withdrawable === 0n) { toast.info('No withdrawable balance available'); return; }
    setWithdrawing(true);
    try {
      const escrow = getP2PEscrowContract(signer);
      const tx = await escrow.withdraw();
      toast.info('Withdrawal submitted, waiting for confirmation...');
      await tx.wait();
      toast.success(`Successfully withdrawn ${parseFloat(ethers.formatEther(withdrawable)).toFixed(4)} ETH!`);
      setWithdrawable(0n);
    } catch (err) {
      console.error(err);
      toast.error(err.reason || 'Withdrawal failed. See console for details.');
    } finally {
      setWithdrawing(false);
    }
  };

  const isAdmin = location.pathname === '/admin';

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/8 bg-slate-950/90 backdrop-blur-xl shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-shadow">
              <Shield size={18} className="text-white" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white">P2P</span>
              <span className="text-base font-bold tracking-tight text-blue-400 ml-1">Escrow</span>
            </div>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded border border-violet-500/30">
              SEPOLIA
            </span>
          </Link>

          {/* Nav Links - Desktop */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-900/60 rounded-lg p-1 border border-white/5">
            <Link
              to="/"
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${!isAdmin ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              Market
            </Link>
            <Link
              to="/admin"
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5 ${isAdmin ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              <Shield size={13} /> Arbitration
            </Link>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            {/* Wrong Network Warning */}
            {isWrongNetwork && address && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1.5 rounded-lg animate-pulse">
                ⚠ Wrong Network
              </span>
            )}

            {/* Withdrawable Balance — always visible when balance exists */}
            {address && withdrawable > 0n && (
              <button
                onClick={withdrawFunds}
                disabled={withdrawing}
                className="flex items-center gap-2 text-sm font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/35 hover:bg-emerald-500/25 px-3 py-1.5 rounded-lg transition-all animate-pulse-ring"
                title="You have ETH ready to claim — click to withdraw to wallet"
              >
                <Download size={14} />
                {withdrawing ? 'Claiming...' : `Claim ${parseFloat(ethers.formatEther(withdrawable)).toFixed(4)} ETH`}
              </button>
            )}

            {/* Contract Info */}
            {address && (
              <div className="relative">
                <button
                  onClick={() => setShowInfo(!showInfo)}
                  className="hidden sm:flex items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors text-xs"
                >
                  Contracts <ChevronDown size={12} />
                </button>
                {showInfo && (
                  <div className="absolute right-0 top-8 bg-slate-900 border border-white/10 rounded-xl p-4 shadow-2xl min-w-[280px] z-50">
                    <p className="text-xs text-slate-500 font-medium mb-3 uppercase tracking-wider">Live on Sepolia</p>
                    <div className="space-y-2">
                      <div>
                        <p className="text-xs text-slate-500">P2P Escrow</p>
                        <a
                          href={`https://sepolia.etherscan.io/address/${ESCROW_ADDRESS}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-blue-400 hover:text-blue-300 font-mono flex items-center gap-1"
                          onClick={() => setShowInfo(false)}
                        >
                          {formatAddress(ESCROW_ADDRESS)} <ExternalLink size={10} />
                        </a>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Multisig Arbitrator</p>
                        <a
                          href={`https://sepolia.etherscan.io/address/${MULTISIG_ADDRESS}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-violet-400 hover:text-violet-300 font-mono flex items-center gap-1"
                          onClick={() => setShowInfo(false)}
                        >
                          {formatAddress(MULTISIG_ADDRESS)} <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Wallet Button */}
            {address ? (
              <div className="flex items-center gap-2 bg-slate-800/80 border border-white/8 rounded-full pl-3 pr-1 py-1">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-sm font-medium text-slate-300 hidden sm:block">
                  {formatAddress(address)}
                </span>
                <button
                  onClick={disconnectWallet}
                  className="p-1.5 rounded-full bg-slate-700 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-all"
                  title="Disconnect wallet"
                >
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isConnecting}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all active:scale-95"
              >
                <Wallet size={15} />
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <div className="sm:hidden flex border-t border-white/5">
        <Link
          to="/"
          className={`flex-1 text-center py-2.5 text-xs font-medium ${!isAdmin ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500'}`}
        >
          Market
        </Link>
        <Link
          to="/admin"
          className={`flex-1 text-center py-2.5 text-xs font-medium ${isAdmin ? 'text-violet-400 border-b-2 border-violet-500' : 'text-slate-500'}`}
        >
          Arbitration
        </Link>
      </div>
    </nav>
  );
};
