import { useState, useEffect, useCallback } from 'react';
import { getP2PEscrowContract } from '../utils/contracts';
import { OfferCard } from './OfferCard';
import { Sparkles, RefreshCw, Filter } from 'lucide-react';
import { ethers } from 'ethers';

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Offers' },
  { value: 'open', label: 'Open' },
  { value: 'locked', label: 'Locked' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'my', label: 'My Trades' },
];

export const OfferList = ({ provider, signer, address, refreshTrigger }) => {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchOffers = useCallback(async () => {
    if (!provider) { setLoading(false); return; }
    setLoading(true);
    try {
      const escrow = getP2PEscrowContract(provider);
      const totalOffers = await escrow.nextOfferId();

      const allOffers = [];
      for (let i = 0; i < Number(totalOffers); i++) {
        const statusName = await escrow.getStatus(i);
        // Exclude Cancelled and Completed (which covers settled and resolved) offers
        if (statusName === 'Cancelled' || statusName === 'Completed') continue;
        
        const offer = await escrow.getOffer(i);
        allOffers.push({
          id: i,
          seller: offer.seller,
          buyer: offer.buyer,
          ethAmount: offer.ethAmount,
          fiatPriceCents: offer.fiatPriceCents,
          lockedAt: offer.lockedAt,
          statusName,
        });
      }

      setOffers(allOffers.reverse());
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch offers:', err);
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers, refreshTrigger]);

  // Auto-refresh every 10 seconds so status changes (e.g. buyer accepted → Locked)
  // appear promptly on the seller's screen without a manual refresh.
  useEffect(() => {
    const interval = setInterval(fetchOffers, 10000);
    return () => clearInterval(interval);
  }, [fetchOffers]);

  const normalAddr = address ? address.toLowerCase() : '';

  const filteredOffers = offers.filter((offer) => {
    if (filter === 'all') return true;
    if (filter === 'my') {
      return (
        normalAddr &&
        (offer.seller.toLowerCase() === normalAddr || offer.buyer.toLowerCase() === normalAddr)
      );
    }
    const statusMap = { open: 'Open', locked: 'Locked', disputed: 'Disputed' };
    return offer.statusName === statusMap[filter];
  });

  const stats = {
    total: offers.length,
    open: offers.filter((o) => o.statusName === 'Open').length,
    locked: offers.filter((o) => o.statusName === 'Locked').length,
    disputed: offers.filter((o) => o.statusName === 'Disputed').length,
  };

  if (!provider) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-white/8 flex items-center justify-center mb-4">
          <Sparkles className="text-blue-400/60" size={28} />
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-slate-500 text-sm max-w-xs">
          Connect your MetaMask wallet to Sepolia to browse and interact with live P2P offers.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'Total', count: stats.total, color: 'text-slate-400' },
            { label: 'Open', count: stats.open, color: 'text-emerald-400' },
            { label: 'Locked', count: stats.locked, color: 'text-amber-400' },
            { label: 'Disputed', count: stats.disputed, color: 'text-red-400' },
          ].map((s) => (
            <div key={s.label} className="bg-slate-800/60 border border-white/6 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <span className={`text-lg font-bold ${s.color}`}>{s.count}</span>
              <span className="text-xs text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          {lastUpdated && (
            <span className="text-[11px] text-slate-600 hidden sm:block">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchOffers}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white border border-white/8 hover:border-white/20 bg-slate-800/60 px-3 py-1.5 rounded-lg transition-all"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 bg-slate-900/40 border border-white/6 rounded-xl p-1 overflow-x-auto">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value)}
            className={`flex-shrink-0 px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${
              filter === opt.value
                ? 'bg-slate-700 text-white shadow'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {opt.value === 'my' && address ? `${opt.label} (${offers.filter(o => o.seller.toLowerCase() === normalAddr || o.buyer.toLowerCase() === normalAddr).length})` : opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && offers.length === 0 ? (
        <div className="py-20 flex flex-col items-center text-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
          <div>
            <p className="text-slate-300 font-medium">Loading from Sepolia...</p>
            <p className="text-slate-500 text-sm mt-1">Fetching live escrow offers</p>
          </div>
        </div>
      ) : filteredOffers.length === 0 ? (
        <div className="border-2 border-dashed border-white/8 rounded-2xl py-20 flex flex-col items-center text-center gap-3">
          <Sparkles className="text-blue-400/30" size={36} />
          <h3 className="text-lg font-semibold text-slate-300">
            {filter === 'my' ? 'No trades found' : 'No offers available'}
          </h3>
          <p className="text-slate-500 text-sm max-w-xs">
            {filter === 'my'
              ? "You haven't created or accepted any offers yet. Be the first to list an offer!"
              : 'No offers match this filter. Change the filter or create the first offer!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOffers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              signer={signer}
              provider={provider}
              address={address}
              onUpdate={fetchOffers}
            />
          ))}
        </div>
      )}
    </div>
  );
};
