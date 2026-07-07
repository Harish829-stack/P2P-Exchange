import { useState } from 'react';
import { ethers } from 'ethers';
import { getP2PEscrowContract } from '../utils/contracts';
import { useToast } from './Toast';
import { PlusCircle, Info, TrendingUp, Lock } from 'lucide-react';
import { parseError } from '../utils/errors';

export const CreateOffer = ({ signer, onOfferCreated }) => {
  const [ethAmount, setEthAmount] = useState('');
  const [fiatPrice, setFiatPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const toast = useToast();

  const ethNum = parseFloat(ethAmount) || 0;
  const fiatNum = parseFloat(fiatPrice) || 0;
  const impliedRate = ethNum > 0 && fiatNum > 0 ? (fiatNum / ethNum).toFixed(2) : null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!signer) { toast.warning('Please connect your wallet first'); return; }
    if (!ethAmount || !fiatPrice || ethNum <= 0 || fiatNum <= 0) {
      toast.error('Please enter valid ETH and USD amounts');
      return;
    }

    setLoading(true);
    setTxHash(null);
    try {
      const escrow = getP2PEscrowContract(signer);
      const value = ethers.parseEther(ethAmount.toString());
      const fiatPriceCents = Math.floor(fiatNum * 100);

      toast.info('Confirm the transaction in MetaMask...');
      const tx = await escrow.listOffer(fiatPriceCents, { value });
      setTxHash(tx.hash);
      toast.info('Transaction submitted! Waiting for confirmation...');
      await tx.wait();

      toast.success(`Offer listed! ${ethAmount} ETH locked for ${fiatPrice} USD`);
      setEthAmount('');
      setFiatPrice('');
      setTxHash(null);
      if (onOfferCreated) onOfferCreated();
    } catch (err) {
      console.error(err);
      const msg = parseError(err);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="relative bg-gradient-to-b from-slate-800/80 to-slate-900/80 border border-white/8 rounded-2xl p-6 shadow-2xl backdrop-blur-sm overflow-hidden">
        {/* Decorative corner */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl pointer-events-none" />

        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Lock size={18} className="text-blue-400" />
              List New Offer
            </h2>
            <p className="text-slate-400 text-sm mt-1">Lock your ETH into the escrow contract to list it for sale</p>
          </div>
          <div className="text-xs text-slate-500 bg-slate-900/60 border border-white/5 rounded-lg px-2 py-1">
            Seller
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* ETH Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">ETH Amount to Sell</label>
            <div className="relative">
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3 pl-10 text-white placeholder-slate-500 transition-all duration-200 outline-none"
                placeholder="0.0000"
                required
              />
              <span className="absolute left-3.5 top-3.5 text-blue-400 font-bold text-sm select-none">Ξ</span>
              <span className="absolute right-3.5 top-3 text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">ETH</span>
            </div>
          </div>

          {/* Fiat Price */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">Asking Price (USD)</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={fiatPrice}
                onChange={(e) => setFiatPrice(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 rounded-xl px-4 py-3 pl-8 text-white placeholder-slate-500 transition-all duration-200 outline-none"
                placeholder="0.00"
                required
              />
              <span className="absolute left-3.5 top-3 text-emerald-400 font-bold text-base select-none">$</span>
              <span className="absolute right-3.5 top-3 text-xs text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">USD</span>
            </div>
          </div>

          {/* Implied Rate */}
          {impliedRate && (
            <div className="flex items-center gap-2 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 animate-fade-in">
              <TrendingUp size={14} className="text-blue-400 flex-shrink-0" />
              <span className="text-sm text-slate-300">
                Implied rate: <span className="font-semibold text-white">${impliedRate}</span> / ETH
              </span>
            </div>
          )}

          {/* Info box */}
          <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3">
            <Info size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400 leading-relaxed">
              Your ETH will be locked in the smart contract until a buyer accepts the offer, or you cancel it. The buyer pays you in fiat (off-chain) before you release funds.
            </p>
          </div>

          {/* Tx Hash Link */}
          {txHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              View transaction on Etherscan ↗
            </a>
          )}

          <button
            type="submit"
            disabled={loading || !signer}
            className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all duration-200 active:scale-[0.98] shadow-lg shadow-blue-500/20 text-sm mt-2"
          >
            {loading ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Processing...
              </>
            ) : (
              <>
                <PlusCircle size={17} />
                Lock ETH & List Offer
              </>
            )}
          </button>

          {!signer && (
            <p className="text-center text-xs text-slate-500">Connect your wallet to create an offer</p>
          )}
        </form>
      </div>
    </div>
  );
};
