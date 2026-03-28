import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useWallet } from './hooks/useWallet';
import { Navbar } from './components/Navbar';
import { CreateOffer } from './components/CreateOffer';
import { OfferList } from './components/OfferList';
import { AdminPanel } from './pages/AdminPanel';
import { ToastProvider } from './components/Toast';
import { useState } from 'react';
import { ShieldCheck, ArrowRight, Wallet, Lock, Zap } from 'lucide-react';

const FEATURES = [
  {
    icon: <Lock size={20} className="text-blue-400" />,
    title: 'Smart Contract Escrow',
    desc: 'ETH is locked on-chain until both parties confirm the trade is complete',
  },
  {
    icon: <ShieldCheck size={20} className="text-violet-400" />,
    title: 'Multisig Arbitration',
    desc: '2-of-3 arbitrator panel resolves disputes transparently via on-chain votes',
  },
  {
    icon: <Zap size={20} className="text-emerald-400" />,
    title: 'Non-Custodial & Trustless',
    desc: 'No middlemen. All trades execute automatically via Solidity logic on Sepolia',
  },
];

const HeroBanner = ({ address, connectWallet, isConnecting }) => (
  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/20 via-violet-600/15 to-slate-900/50 border border-white/8 p-8 mb-8">
    {/* Background blobs */}
    <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl pointer-events-none" />
    <div className="absolute bottom-0 right-0 w-48 h-48 bg-violet-500/10 rounded-full translate-x-1/3 translate-y-1/3 blur-3xl pointer-events-none" />

    <div className="relative z-10 max-w-2xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-widest text-blue-400 bg-blue-400/10 border border-blue-400/20 px-2.5 py-1 rounded-full">
          Live on Sepolia Testnet
        </span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-full">
          ⚡ On-Chain
        </span>
      </div>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
        Decentralized{' '}
        <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
          P2P Escrow
        </span>
      </h1>
      <p className="text-slate-400 text-base leading-relaxed mb-6 max-w-xl">
        Trustless peer-to-peer crypto-to-fiat trading with smart contract escrow and multisig dispute resolution. No middlemen. Your keys, your trade.
      </p>

      <div className="flex flex-wrap gap-3">
        {!address ? (
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-semibold px-6 py-2.5 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
          >
            <Wallet size={16} />
            {isConnecting ? 'Connecting...' : 'Connect Wallet to Start'}
            <ArrowRight size={15} />
          </button>
        ) : (
          <span className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-4 py-2 rounded-xl text-sm font-medium">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Wallet Connected · Ready to Trade
          </span>
        )}
        <a
          href="https://sepolia.etherscan.io/address/0xC71BFb170CB1133D3dD3F587B0E9BFAD848a2aAd"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white border border-white/8 hover:border-white/20 px-4 py-2 rounded-xl transition-all"
        >
          View Contract ↗
        </a>
      </div>
    </div>

    {/* Feature badges */}
    <div className="relative z-10 hidden lg:flex gap-4 mt-8 pt-6 border-t border-white/6">
      {FEATURES.map((f) => (
        <div key={f.title} className="flex items-start gap-3 flex-1">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-800 border border-white/8 flex items-center justify-center">
            {f.icon}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{f.title}</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{f.desc}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const EscrowDashboard = ({ provider, signer, address, connectWallet, isConnecting }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const triggerRefresh = () => setRefreshTrigger((p) => p + 1);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Banner */}
      <HeroBanner address={address} connectWallet={connectWallet} isConnecting={isConnecting} />

      {/* Layout: Create Offer (sidebar) + List */}
      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8">
        {/* Sidebar: Create Offer */}
        <div className="lg:sticky lg:top-24 self-start">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="text-lg font-bold text-white">Sell ETH</h2>
            <span className="text-xs text-slate-500">Seller</span>
          </div>
          <CreateOffer signer={signer} onOfferCreated={triggerRefresh} />
        </div>

        {/* Main: Offer List */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Browse Offers</h2>
            <span className="text-xs text-slate-500">Buyer / Viewer</span>
          </div>
          <OfferList provider={provider} signer={signer} address={address} refreshTrigger={refreshTrigger} />
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const {
    provider, signer, address, chainId,
    connectWallet, disconnectWallet,
    isConnecting, isWrongNetwork,
  } = useWallet();

  return (
    <ToastProvider>
      <Router>
        <div className="min-h-screen bg-[#080c17] text-slate-100">
          {/* Ambient background */}
          <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
            <div className="absolute top-40 right-1/4 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-blue-500/3 rounded-full blur-3xl" />
          </div>

          <Navbar
            provider={provider}
            signer={signer}
            address={address}
            connectWallet={connectWallet}
            disconnectWallet={disconnectWallet}
            isConnecting={isConnecting}
            isWrongNetwork={isWrongNetwork}
          />

          <Routes>
            <Route
              path="/"
              element={
                <EscrowDashboard
                  provider={provider}
                  signer={signer}
                  address={address}
                  connectWallet={connectWallet}
                  isConnecting={isConnecting}
                />
              }
            />
            <Route
              path="/admin"
              element={<AdminPanel provider={provider} signer={signer} address={address} />}
            />
          </Routes>

          {/* Footer */}
          <footer className="border-t border-white/5 mt-16 py-6 text-center">
            <p className="text-xs text-slate-600">
              P2P Escrow · Smart contracts deployed on Sepolia ·{' '}
              <a href="https://sepolia.etherscan.io" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-400">
                Etherscan ↗
              </a>
            </p>
          </footer>
        </div>
      </Router>
    </ToastProvider>
  );
}
