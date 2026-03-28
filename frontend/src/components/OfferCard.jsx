import { useState, useEffect, useCallback } from 'react';
import { getP2PEscrowContract, formatAddress, formatEth, formatUSD, ESCROW_ADDRESS } from '../utils/contracts';
import { useToast } from './Toast';
import { ethers } from 'ethers';
import {
  Check, AlertTriangle, ShieldAlert, Ban, Unlock,
  User, ExternalLink, Clock, TrendingUp, Copy, Wallet, RefreshCw
} from 'lucide-react';

const STATUS_CONFIG = {
  Open: {
    label: 'Open',
    dot: 'bg-emerald-400',
    badge: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
    border: 'border-t-emerald-500/40',
  },
  Locked: {
    label: 'Locked',
    dot: 'bg-amber-400 animate-pulse',
    badge: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
    border: 'border-t-amber-500/40',
  },
  Completed: {
    label: 'Completed',
    dot: 'bg-blue-400',
    badge: 'text-blue-400 bg-blue-400/10 border-blue-400/25',
    border: 'border-t-blue-500/40',
  },
  Disputed: {
    label: 'Disputed',
    dot: 'bg-red-400 animate-pulse',
    badge: 'text-red-400 bg-red-400/10 border-red-400/25',
    border: 'border-t-red-500/40',
  },
  Cancelled: {
    label: 'Cancelled',
    dot: 'bg-slate-500',
    badge: 'text-slate-400 bg-slate-800 border-slate-600/25',
    border: 'border-t-slate-700/40',
  },
};

const CountdownTimer = ({ lockedAt }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const lockTime = Number(lockedAt) * 1000;
      const end = lockTime + 86400 * 1000; // 1 day
      const diff = end - Date.now();

      if (diff <= 0) {
        setTimeLeft('Timeout reached');
        return;
      }

      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);

      setTimeLeft(`${h}h ${m}m ${s}s`);
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [lockedAt]);

  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-400">
      <Clock size={11} />
      <span>Timeout in: <span className="font-mono font-medium">{timeLeft}</span></span>
    </div>
  );
};

const copyToClipboard = (text, toast) => {
  navigator.clipboard.writeText(text).then(() => toast.success('Address copied!')).catch(() => {});
};

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
// Props: offer, signer, provider, address, onUpdate
export const OfferCard = ({ offer, signer, provider, address, onUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [withdrawableAmt, setWithdrawableAmt] = useState(0n);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const toast = useToast();

  // ── Address role detection ─────────────────────────────────────
  // normalise both sides to lowercase to avoid checksum mismatches
  const normalAddr = address ? address.toLowerCase() : '';
  const isSeller = !!(normalAddr && offer.seller && offer.seller.toLowerCase() === normalAddr);
  const isBuyer  = !!(normalAddr && offer.buyer  && offer.buyer.toLowerCase()  === normalAddr);
  const isInvolved = isSeller || isBuyer;

  const cfg = STATUS_CONFIG[offer.statusName] || STATUS_CONFIG.Open;

  // ── Fetch withdrawable balance for this address ───────────────
  // Runs whenever address or offer status changes; relevant for
  // Completed and Cancelled states where ETH may be claimable.
  const fetchWithdrawable = useCallback(async () => {
    if (!provider || !normalAddr) { setWithdrawableAmt(0n); return; }
    // Only check if there's any chance of a balance
    if (!['Completed', 'Cancelled', 'Disputed'].includes(offer.statusName) && !isInvolved) return;
    setCheckingBalance(true);
    try {
      const escrow = getP2PEscrowContract(provider);
      const bal = await escrow.withdrawable(address);
      setWithdrawableAmt(bal);
    } catch (e) {
      console.warn('withdrawable check failed', e);
    } finally {
      setCheckingBalance(false);
    }
  }, [provider, address, normalAddr, offer.statusName, isInvolved]);

  useEffect(() => {
    fetchWithdrawable();
  }, [fetchWithdrawable]);

  // ── Generic action dispatcher ──────────────────────────────────
  const handleAction = async (actionFn, successMsg, pendingMsg = 'Confirm in MetaMask...') => {
    if (!signer) { toast.warning('Please connect your wallet'); return; }
    setLoading(true);
    setTxHash(null);
    try {
      toast.info(pendingMsg);
      const escrow = getP2PEscrowContract(signer);
      const tx = await actionFn(escrow);
      setTxHash(tx.hash);
      toast.info('Transaction submitted – waiting for confirmation...');
      await tx.wait();
      toast.success(successMsg);
      // Refresh withdrawable balance immediately after any successful tx
      await fetchWithdrawable();
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error(err);
      const msg = err.reason || err.shortMessage || 'Transaction failed. See console.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Individual actions ─────────────────────────────────────────
  const acceptOffer = () =>
    handleAction(
      (e) => e.acceptOffer(offer.id),
      `Offer #${offer.id} accepted! Pay the seller in fiat, then ask them to release funds.`,
      'Accepting offer…'
    );

  const releaseFunds = () =>
    handleAction(
      (e) => e.releaseFunds(offer.id),
      `Funds released! Buyer can now withdraw ${formatEth(offer.ethAmount)} ETH from this card.`,
      'Releasing funds…'
    );

  const openDispute = () =>
    handleAction(
      (e) => e.openDispute(offer.id),
      `Dispute opened for Offer #${offer.id}. Arbitrators will review.`,
      'Opening dispute…'
    );

  const cancelOffer = () =>
    handleAction(
      (e) => e.cancelOffer(offer.id),
      `Offer #${offer.id} cancelled. Your ETH is claimable below.`,
      'Cancelling offer…'
    );

  // ── Pull-payment withdraw ──────────────────────────────────────
  // The contract uses a pull-payment pattern: after releaseFunds() or
  // resolveDispute(), ETH lands in withdrawable[address] – NOT in the
  // wallet directly. The user must call withdraw() to sweep it out.
  const claimETH = () =>
    handleAction(
      (e) => e.withdraw(),
      `${formatEth(withdrawableAmt)} ETH successfully sent to your wallet!`,
      'Claiming ETH from escrow…'
    );

  // ── Derived display values ─────────────────────────────────────
  const ethVal      = formatEth(offer.ethAmount);
  const fiatVal     = formatUSD(offer.fiatPriceCents);
  const impliedRate = offer.ethAmount > 0n
    ? (Number(offer.fiatPriceCents) / 100 / parseFloat(ethers.formatEther(offer.ethAmount))).toFixed(0)
    : null;

  const hasClaimable = withdrawableAmt > 0n;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`relative group bg-gradient-to-b from-slate-800/60 to-slate-900/60 border border-white/6 border-t-2 ${cfg.border} rounded-2xl p-5 shadow-lg hover:shadow-xl hover:border-white/10 transition-all duration-200 overflow-hidden`}>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-slate-900/80 rounded-2xl flex flex-col items-center justify-center z-20 gap-3 backdrop-blur-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
          <p className="text-xs text-slate-400">Processing on Sepolia…</p>
          {txHash && (
            <a
              href={`https://sepolia.etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View on Etherscan <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Offer #{offer.id}</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-2xl font-bold text-white">{ethVal}</span>
            <span className="text-base font-medium text-blue-400">ETH</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
          {isInvolved && (
            <span className="text-[10px] text-slate-500 font-medium">
              {isSeller ? '👤 Your offer' : '🛒 You bought'}
            </span>
          )}
        </div>
      </div>

      {/* ── Details ── */}
      <div className="bg-slate-950/40 rounded-xl border border-white/4 p-3.5 mb-4 space-y-2.5">
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500">Fiat Price</span>
          <span className="font-bold text-emerald-400 text-base">{fiatVal}</span>
        </div>
        {impliedRate && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500 flex items-center gap-1">
              <TrendingUp size={11} /> Rate
            </span>
            <span className="text-slate-300 font-medium text-xs">${Number(impliedRate).toLocaleString()} / ETH</span>
          </div>
        )}
        <div className="h-px bg-white/4" />
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-500 flex items-center gap-1">
            <User size={11} /> Seller
          </span>
          <button
            onClick={() => copyToClipboard(offer.seller, toast)}
            className="font-mono text-xs text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
            title={offer.seller}
          >
            {formatAddress(offer.seller)} <Copy size={10} className="opacity-50" />
          </button>
        </div>
        {offer.buyer !== ethers.ZeroAddress && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-500 flex items-center gap-1">
              <User size={11} /> Buyer
            </span>
            <button
              onClick={() => copyToClipboard(offer.buyer, toast)}
              className="font-mono text-xs text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
              title={offer.buyer}
            >
              {formatAddress(offer.buyer)} <Copy size={10} className="opacity-50" />
            </button>
          </div>
        )}
        {offer.statusName === 'Locked' && offer.lockedAt > 0n && (
          <CountdownTimer lockedAt={offer.lockedAt} />
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          ACTION BUTTONS
          ══════════════════════════════════════════════════════════ */}
      <div className="space-y-2">

        {/* ── BUY (Open + not seller + wallet connected) ── */}
        {offer.statusName === 'Open' && !isSeller && address && (
          <button
            onClick={acceptOffer}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold py-2.5 rounded-xl transition-all active:scale-[0.98] text-sm shadow-blue-500/20 shadow-lg"
          >
            <Check size={15} /> Buy This Offer
          </button>
        )}

        {/* ── RELEASE FUNDS  (Locked + seller) ── */}
        {offer.statusName === 'Locked' && isSeller && (
          <button
            onClick={releaseFunds}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-semibold py-2.5 rounded-xl transition-all active:scale-[0.98] text-sm shadow-emerald-500/20 shadow-lg"
          >
            <Unlock size={15} /> Release Funds to Buyer
          </button>
        )}

        {/* ── CANCEL OPEN OFFER (Open + seller) ── */}
        {offer.statusName === 'Open' && isSeller && (
          <button
            onClick={cancelOffer}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 font-medium py-2.5 rounded-xl transition-all active:scale-[0.98] text-sm"
          >
            <Ban size={15} /> Cancel Offer
          </button>
        )}

        {/* ── OPEN DISPUTE (Locked + seller or buyer) ── */}
        {offer.statusName === 'Locked' && (isSeller || isBuyer) && (
          <button
            onClick={openDispute}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 font-medium py-2.5 rounded-xl transition-all active:scale-[0.98] text-sm"
          >
            <ShieldAlert size={15} /> Open Dispute
          </button>
        )}

        {/* ── No wallet connected hint ── */}
        {offer.statusName === 'Open' && !address && (
          <p className="text-center text-xs text-slate-500 py-2">Connect wallet to interact</p>
        )}

        {/* ── Disputed: awaiting arbitration ── */}
        {offer.statusName === 'Disputed' && !hasClaimable && (
          <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/20 rounded-xl px-3 py-2.5">
            <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
            <p className="text-xs text-slate-400">Under arbitration. Awaiting multisig resolution.</p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            CLAIM ETH SECTION
            ──────────────────────────────────────────────────────────
            This is the PULL PAYMENT claim step. ETH from releaseFunds()
            or resolveDispute() lands in withdrawable[address] on the
            escrow contract. The user must explicitly call withdraw()
            to sweep it into their actual wallet balance.
            Shown for any connected address that has a pending balance,
            regardless of offer status (Completed, Cancelled, Disputed).
            ══════════════════════════════════════════════════════════ */}
        {normalAddr && hasClaimable && (
          <div className="mt-1 rounded-xl border border-emerald-500/40 bg-emerald-500/8 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Wallet size={14} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-300">ETH Ready to Claim</p>
                  <p className="text-[10px] text-slate-500">Sitting in escrow contract</p>
                </div>
              </div>
              <span className="text-lg font-bold text-emerald-400">
                {formatEth(withdrawableAmt)} ETH
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              This ETH is held in the escrow contract. Click below to send it to your wallet.
            </p>
            <button
              onClick={claimETH}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold py-2.5 rounded-xl transition-all active:scale-[0.98] text-sm shadow-lg shadow-emerald-500/25"
            >
              <Wallet size={15} />
              Claim {formatEth(withdrawableAmt)} ETH to Wallet
            </button>
          </div>
        )}

        {/* Refresh balance button when completed/cancelled and no claimable shown yet */}
        {normalAddr && (offer.statusName === 'Completed' || offer.statusName === 'Cancelled') && !hasClaimable && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-slate-500">
              {offer.statusName === 'Completed' ? '✅ Trade completed' : '🚫 Offer cancelled'}
            </span>
            <button
              onClick={fetchWithdrawable}
              disabled={checkingBalance}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
              title="Check if you have ETH to claim"
            >
              <RefreshCw size={10} className={checkingBalance ? 'animate-spin' : ''} />
              Check balance
            </button>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="mt-3 pt-3 border-t border-white/4 flex justify-between items-center">
        <a
          href={`https://sepolia.etherscan.io/address/${ESCROW_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-slate-600 hover:text-slate-400 flex items-center gap-1 transition-colors"
        >
          Escrow Contract <ExternalLink size={9} />
        </a>
        {txHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
          >
            Last tx <ExternalLink size={9} />
          </a>
        )}
      </div>
    </div>
  );
};
