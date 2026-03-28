import { useState, useEffect, useCallback } from 'react';
import { getMultisigContract, getP2PEscrowContract, formatAddress, ESCROW_ADDRESS, MULTISIG_ADDRESS, MULTISIG_ABI, ESCROW_ABI } from '../utils/contracts';
import { useToast } from '../components/Toast';
import { Shield, CheckCircle, AlertOctagon, RefreshCw, ExternalLink, Gavel, Users, Clock, Info, XCircle } from 'lucide-react';
import { ethers } from 'ethers';

const TxCard = ({ tx, signer, address, threshold, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleApprove = async () => {
    if (!signer) { toast.warning('Connect wallet to approve'); return; }
    setLoading(true);
    try {
      const multisig = getMultisigContract(signer);
      toast.info('Confirm approval in MetaMask...');
      const t = await multisig.approveTx(tx.id);
      await t.wait();
      toast.success(`Approved TX #${tx.id}`);
      onRefresh();
    } catch (err) {
      toast.error(err.reason || `Approval failed: ${err.shortMessage || 'See console'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!signer) { toast.warning('Connect wallet to execute'); return; }
    setLoading(true);
    try {
      const multisig = getMultisigContract(signer);
      toast.info('Executing dispute resolution on-chain...');
      const t = await multisig.executeTx(tx.id);
      await t.wait();
      // The escrow contract credits withdrawable[winner] — NOT wallet balance directly.
      // The winner must call withdraw() themselves. We show a clear CTA.
      toast.success(
        `✅ TX #${tx.id} executed! The winner's ETH is now in the escrow contract. ` +
        `They must go to the Market page and click "Claim ETH to Wallet" on the offer card.`,
        8000 // longer duration so they read it
      );
      onRefresh();
    } catch (err) {
      console.error(err);
      toast.error(err.reason || `Execution failed. Ensure ${threshold} approvals exist and it hasn't already run.`);
    } finally {
      setLoading(false);
    }
  };

  const approvalCount = Number(tx.approvals);
  const approvalPct = Math.min((approvalCount / Number(threshold)) * 100, 100);
  const canExecute = !tx.executed && approvalCount >= Number(threshold);

  // Decode function data to understand what the tx does
  let txDescription = 'Resolve Dispute';
  let resolveDir = null;
  try {
    const iface = new ethers.Interface(ESCROW_ABI);
    const decoded = iface.parseTransaction({ data: tx.data });
    if (decoded && decoded.name === 'resolveDispute') {
      const offerId = decoded.args[0].toString();
      const releaseToBuyer = decoded.args[1];
      resolveDir = releaseToBuyer ? 'buyer' : 'seller';
      txDescription = `Offer #${offerId} → ${releaseToBuyer ? 'Release to Buyer' : 'Return to Seller'}`;
    }
  } catch { /* ignore decode errors */ }

  return (
    <div className={`bg-slate-800/50 border rounded-xl p-4 transition-all ${tx.executed ? 'border-white/4 opacity-60' : 'border-white/8 hover:border-white/14'}`}>
      {loading && (
        <div className="absolute inset-0 bg-slate-900/70 rounded-xl flex items-center justify-center z-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-violet-400" />
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">TX #{tx.id}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tx.executed ? 'bg-emerald-400/10 text-emerald-400' : 'bg-amber-400/10 text-amber-400'}`}>
              {tx.executed ? 'Executed' : 'Pending'}
            </span>
          </div>
          <p className="text-sm font-semibold text-white truncate">{txDescription}</p>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            To: {formatAddress(tx.target)}
          </p>
        </div>

        {resolveDir && (
          <div className={`flex-shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg border ${resolveDir === 'buyer' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-violet-500/10 text-violet-400 border-violet-500/20'}`}>
            {resolveDir === 'buyer' ? '→ Buyer' : '→ Seller'}
          </div>
        )}
      </div>

      {/* Approval progress */}
      {!tx.executed && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Users size={10} /> Approvals
            </span>
            <span className="text-xs font-semibold text-white">
              {approvalCount} / {threshold.toString()}
            </span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${approvalPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {!tx.executed && !tx.hasApproved && (
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 text-sm font-medium border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 py-2 rounded-lg transition-all active:scale-[0.98]"
          >
            <CheckCircle size={13} /> Approve
          </button>
        )}
        {tx.executed === false && tx.hasApproved && !canExecute && (
          <div className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-500 border border-slate-700 py-2 rounded-lg">
            <Clock size={12} /> Waiting for {Number(threshold) - approvalCount} more approval(s)
          </div>
        )}
        {canExecute && (
          <button
            onClick={handleExecute}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white py-2 rounded-lg transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
          >
            <Gavel size={13} /> Execute Resolution
          </button>
        )}
        {tx.executed && (
          <div className="flex-1 flex items-center justify-center gap-1.5 text-xs text-emerald-400 bg-emerald-400/5 border border-emerald-400/20 py-2 rounded-lg">
            <CheckCircle size={12} /> Resolution Complete
          </div>
        )}
        <a
          href={`https://sepolia.etherscan.io/address/${MULTISIG_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          className="p-2 text-slate-600 hover:text-slate-400 border border-white/6 rounded-lg transition-colors"
          title="View on Etherscan"
        >
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
};

export const AdminPanel = ({ provider, signer, address }) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offerIdToResolve, setOfferIdToResolve] = useState('');
  const [resolutionTarget, setResolutionTarget] = useState('buyer');
  const [threshold, setThreshold] = useState(2n);
  const [owners, setOwners] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disputedOffers, setDisputedOffers] = useState([]);
  const toast = useToast();

  const fetchData = useCallback(async () => {
    if (!provider) return;
    setLoading(true);
    try {
      const multisig = getMultisigContract(provider);
      const escrow = getP2PEscrowContract(provider);

      // Fetch threshold and owners
      const [thresh, ownerList, txCount] = await Promise.all([
        multisig.threshold(),
        multisig.getOwners(),
        multisig.nextTxId(),
      ]);
      setThreshold(thresh);
      setOwners(ownerList);

      if (address) {
        const ownerStatus = await multisig.isOwner(address);
        setIsOwner(ownerStatus);
      }

      // Fetch all multisig transactions
      const allTxs = [];
      for (let i = 0; i < Number(txCount); i++) {
        const tx = await multisig.getTx(i);
        let hasApproved = false;
        if (address) hasApproved = await multisig.approved(i, address);
        allTxs.push({ id: i, ...tx, hasApproved });
      }
      setTransactions(allTxs.reverse());

      // Fetch disputed offers
      const totalOffers = await escrow.nextOfferId();
      const disputed = [];
      for (let i = 0; i < Number(totalOffers); i++) {
        const status = await escrow.getStatus(i);
        if (status === 'Disputed') {
          const offer = await escrow.getOffer(i);
          disputed.push({ id: i, ...offer });
        }
      }
      setDisputedOffers(disputed);
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  }, [provider, address]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleProposeResolution = async (e) => {
    e.preventDefault();
    if (!signer) { toast.warning('Connect wallet as an arbitrator owner'); return; }
    if (!isOwner) { toast.error('You are not a multisig owner. Proposal rejected.'); return; }

    setSubmitting(true);
    try {
      const escrowIface = new ethers.Interface(ESCROW_ABI);
      const isReleaseToBuyer = resolutionTarget === 'buyer';
      const data = escrowIface.encodeFunctionData('resolveDispute', [offerIdToResolve, isReleaseToBuyer]);

      const multisig = getMultisigContract(signer);
      toast.info('Proposing resolution... confirm in MetaMask');
      const tx = await multisig.submitTx(ESCROW_ADDRESS, 0, data);
      await tx.wait();

      toast.success(`Resolution proposed for Offer #${offerIdToResolve}. Other owners must approve.`);
      setOfferIdToResolve('');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(err.reason || 'Proposal failed. Are you an owner?');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingTxs = transactions.filter((t) => !t.executed);
  const executedTxs = transactions.filter((t) => t.executed);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Gavel size={20} className="text-white" />
            </div>
            Arbitration Panel
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Multisig-governed dispute resolution. Requires {threshold.toString()}-of-{owners.length} owner signatures.
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white border border-white/8 hover:border-white/20 bg-slate-800/60 px-3 py-2 rounded-lg transition-all"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Role badge */}
      {address && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isOwner ? 'bg-violet-500/10 border-violet-500/25' : 'bg-slate-800/50 border-white/6'}`}>
          <Shield size={16} className={isOwner ? 'text-violet-400' : 'text-slate-500'} />
          <div>
            <p className={`text-sm font-semibold ${isOwner ? 'text-violet-300' : 'text-slate-400'}`}>
              {isOwner ? '✅ You are a Multisig Owner' : '👤 Connected as Observer'}
            </p>
            <p className="text-xs text-slate-500">
              {isOwner
                ? 'You can propose and approve dispute resolutions'
                : 'You can view transactions but cannot sign'}
            </p>
          </div>
        </div>
      )}

      {/* Disputed Offers */}
      {disputedOffers.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
          <h2 className="text-lg font-bold text-red-400 flex items-center gap-2 mb-4">
            <AlertOctagon size={18} /> Active Disputes ({disputedOffers.length})
          </h2>
          <div className="space-y-2">
            {disputedOffers.map((offer) => (
              <div key={offer.id} className="flex items-center justify-between bg-slate-900/60 border border-white/6 rounded-xl px-4 py-3">
                <div>
                  <span className="text-sm font-semibold text-white">Offer #{offer.id}</span>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Seller: {formatAddress(offer.seller)} · Buyer: {formatAddress(offer.buyer)}
                  </div>
                </div>
                <button
                  onClick={() => setOfferIdToResolve(offer.id.toString())}
                  className="text-xs font-medium text-violet-400 hover:text-violet-300 border border-violet-500/30 px-3 py-1.5 rounded-lg transition-all hover:bg-violet-500/10"
                >
                  Resolve →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Propose Resolution */}
      <div className="bg-slate-800/50 border border-white/8 rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2 mb-5">
          <Gavel size={18} className="text-violet-400" />
          Propose Dispute Resolution
        </h2>

        <form onSubmit={handleProposeResolution} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Disputed Offer ID</label>
              <input
                type="number"
                min="0"
                value={offerIdToResolve}
                onChange={(e) => setOfferIdToResolve(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 transition-all outline-none"
                placeholder="e.g. 0"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Award Funds To</label>
              <select
                value={resolutionTarget}
                onChange={(e) => setResolutionTarget(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700 hover:border-slate-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 rounded-xl px-4 py-3 text-white transition-all outline-none appearance-none"
              >
                <option value="buyer">🛒 Buyer (Seller failed to deliver)</option>
                <option value="seller">👤 Seller (Buyer didn't pay)</option>
              </select>
            </div>
          </div>

          {/* Info alert */}
          <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/15 rounded-xl px-4 py-3">
            <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              Submitting a proposal puts it in the multisig queue. {threshold.toString()} owners must approve before it can be executed.
              The encoded <code className="text-blue-400 bg-slate-800 px-1 rounded">resolveDispute()</code> call will be executed on the escrow contract.
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || !signer || !isOwner}
            className="flex items-center justify-center gap-2 w-full sm:w-auto bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-semibold px-8 py-3 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-violet-500/20 text-sm"
          >
            {submitting ? (
              <><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting...</>
            ) : (
              <><Gavel size={16} /> Submit Proposal</>
            )}
          </button>
          {!isOwner && address && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <XCircle size={12} /> Only multisig owners can submit proposals
            </p>
          )}
        </form>
      </div>

      {/* Owners List */}
      {owners.length > 0 && (
        <div className="bg-slate-800/30 border border-white/6 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Users size={14} /> Multisig Owners ({owners.length}) · Threshold: {threshold.toString()}/{owners.length}
          </h3>
          <div className="flex flex-wrap gap-2">
            {owners.map((owner, i) => (
              <a
                key={i}
                href={`https://sepolia.etherscan.io/address/${owner}`}
                target="_blank"
                rel="noreferrer"
                className={`font-mono text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition-all hover:border-violet-500/40 ${owner.toLowerCase() === address?.toLowerCase() ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' : 'bg-slate-900/60 border-white/6 text-slate-400 hover:text-white'}`}
              >
                {owner.toLowerCase() === address?.toLowerCase() && '⭐ '}
                {formatAddress(owner)}
                <ExternalLink size={9} className="opacity-50" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Pending TXs */}
      <div>
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Clock size={18} className="text-amber-400" />
          Pending Transactions
          {pendingTxs.length > 0 && (
            <span className="text-sm bg-amber-400/10 text-amber-400 border border-amber-400/20 px-2 py-0.5 rounded-full">
              {pendingTxs.length}
            </span>
          )}
        </h2>

        {loading ? (
          <div className="py-8 flex justify-center">
            <RefreshCw className="animate-spin text-slate-500" size={20} />
          </div>
        ) : pendingTxs.length === 0 ? (
          <div className="border-2 border-dashed border-white/6 rounded-2xl py-12 text-center">
            <CheckCircle className="mx-auto text-slate-600 mb-3" size={28} />
            <p className="text-slate-500 text-sm">No pending transactions. All disputes are resolved.</p>
          </div>
        ) : (
          <div className="grid gap-3 relative">
            {pendingTxs.map((tx) => (
              <TxCard
                key={tx.id}
                tx={tx}
                signer={signer}
                address={address}
                threshold={threshold}
                onRefresh={fetchData}
              />
            ))}
          </div>
        )}
      </div>

      {/* Executed TXs */}
      {executedTxs.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <CheckCircle size={18} className="text-emerald-400" />
            Executed Resolutions
          </h2>
          <div className="grid gap-3">
            {executedTxs.map((tx) => (
              <TxCard
                key={tx.id}
                tx={tx}
                signer={signer}
                address={address}
                threshold={threshold}
                onRefresh={fetchData}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
