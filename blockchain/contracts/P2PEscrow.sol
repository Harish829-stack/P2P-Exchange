// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title P2P Escrow (Industry Standard Version)
 * @notice Secure peer-to-peer crypto exchange escrow
 *
 * Features:
 *  - Reentrancy protection
 *  - Timeout protection
 *  - Dispute resolution via arbitrator
 *  - Gas optimized custom errors
 *  - Pull payment safety option
 *  - Clean lifecycle state machine
 */

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IMultisigArbitrator {
    function isOwner(address account) external view returns (bool);
}

contract P2PEscrow is ReentrancyGuard {

    // ─────────────────────────────────────────────
    // Errors (gas efficient)
    // ─────────────────────────────────────────────

    error NotSeller();
    error NotBuyer();
    error NotArbitrator();
    error InvalidStatus();
    error TransferFailed();
    error InvalidAmount();
    error CannotBuyOwnOffer();
    error TimeoutNotReached();
    error ArbitratorCannotTrade();

    // ─────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────

    uint256 public constant LOCK_TIMEOUT = 1 days;


    enum Status {
        Open,
        Locked,
        Completed,
        Cancelled,
        Disputed
    }

    struct Offer {
        address payable seller;
        address payable buyer;
        uint256 ethAmount;
        uint256 fiatPriceCents;
        uint256 lockedAt;
        Status status;
    }

    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────

    uint256 public nextOfferId;

    mapping(uint256 => Offer) public offers;

    address public immutable arbitrator;

    // Pull payment balance mapping
    mapping(address => uint256) public withdrawable;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event OfferListed(
        uint256 indexed offerId,
        address indexed seller,
        uint256 ethAmount,
        uint256 fiatPriceCents
    );

    event OfferAccepted(
        uint256 indexed offerId,
        address indexed buyer
    );

    event FundsReleased(
        uint256 indexed offerId,
        address indexed buyer,
        uint256 ethAmount
    );

    event OfferCancelled(uint256 indexed offerId);

    event DisputeOpened(uint256 indexed offerId);

    event DisputeResolved(
        uint256 indexed offerId,
        address winner
    );

    event Withdrawal(address indexed user, uint256 amount);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor(address _arbitrator) {
        arbitrator = _arbitrator;
    }

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    modifier onlySeller(uint256 offerId) {
        if (msg.sender != offers[offerId].seller)
            revert NotSeller();
        _;
    }

    modifier onlyBuyer(uint256 offerId) {
        if (msg.sender != offers[offerId].buyer)
            revert NotBuyer();
        _;
    }

    modifier onlyArbitrator() {
        if (msg.sender != arbitrator)
            revert NotArbitrator();
        _;
    }

    modifier inStatus(uint256 offerId, Status expected) {
        if (offers[offerId].status != expected)
            revert InvalidStatus();
        _;
    }

    // ─────────────────────────────────────────────
    // 1. Seller lists offer
    // ─────────────────────────────────────────────

    function listOffer(uint256 fiatPriceCents)
        external
        payable
        returns (uint256 offerId)
    {
        if (msg.value == 0) revert InvalidAmount();
        if (fiatPriceCents == 0) revert InvalidAmount();
        
        if (IMultisigArbitrator(arbitrator).isOwner(msg.sender)) {
            revert ArbitratorCannotTrade();
        }

        offerId = nextOfferId++;

        offers[offerId] = Offer({
            seller: payable(msg.sender),
            buyer: payable(address(0)),
            ethAmount: msg.value,
            fiatPriceCents: fiatPriceCents,
            lockedAt: 0,
            status: Status.Open
        });

        emit OfferListed(
            offerId,
            msg.sender,
            msg.value,
            fiatPriceCents
        );
    }

    // ─────────────────────────────────────────────
    // 2. Buyer accepts offer
    // ─────────────────────────────────────────────

    function acceptOffer(uint256 offerId)
        external
        inStatus(offerId, Status.Open)
    {
        Offer storage offer = offers[offerId];

        if (msg.sender == offer.seller)
            revert CannotBuyOwnOffer();

        if (IMultisigArbitrator(arbitrator).isOwner(msg.sender)) {
            revert ArbitratorCannotTrade();
        }

        offer.buyer = payable(msg.sender);
        offer.lockedAt = block.timestamp;
        offer.status = Status.Locked;

        emit OfferAccepted(offerId, msg.sender);
    }

    // ─────────────────────────────────────────────
    // 3. Seller releases funds after payment
    // ─────────────────────────────────────────────

    function releaseFunds(uint256 offerId)
        external
        nonReentrant
        onlySeller(offerId)
        inStatus(offerId, Status.Locked)
    {
        Offer storage offer = offers[offerId];

        if (offer.buyer == address(0))
            revert InvalidStatus();

        offer.status = Status.Completed;

        withdrawable[offer.buyer] += offer.ethAmount;

        emit FundsReleased(
            offerId,
            offer.buyer,
            offer.ethAmount
        );
    }

    // ─────────────────────────────────────────────
    // Cancel before buyer accepts
    // ─────────────────────────────────────────────

    function cancelOffer(uint256 offerId)
        external
        nonReentrant
        onlySeller(offerId)
        inStatus(offerId, Status.Open)
    {
        Offer storage offer = offers[offerId];

        offer.status = Status.Cancelled;

        withdrawable[offer.seller] += offer.ethAmount;

        emit OfferCancelled(offerId);
    }

    // ─────────────────────────────────────────────
    // Cancel after timeout
    // ─────────────────────────────────────────────

    function cancelAfterTimeout(uint256 offerId)
        external
        nonReentrant
        onlySeller(offerId)
        inStatus(offerId, Status.Locked)
    {
        Offer storage offer = offers[offerId];

        if (
            block.timestamp <
            offer.lockedAt + LOCK_TIMEOUT
        )
            revert TimeoutNotReached();

        offer.status = Status.Cancelled;

        withdrawable[offer.seller] += offer.ethAmount;

        emit OfferCancelled(offerId);
    }

    // ─────────────────────────────────────────────
    // Dispute mechanism
    // ─────────────────────────────────────────────

    function openDispute(uint256 offerId)
        external
        inStatus(offerId, Status.Locked)
    {
        Offer storage offer = offers[offerId];

        if (
            msg.sender != offer.seller &&
            msg.sender != offer.buyer
        )
            revert InvalidStatus();

        offer.status = Status.Disputed;

        emit DisputeOpened(offerId);
    }

    function resolveDispute(
        uint256 offerId,
        bool releaseToBuyer
    )
        external
        onlyArbitrator
        inStatus(offerId, Status.Disputed)
    {
        Offer storage offer = offers[offerId];

        offer.status = Status.Completed;

        address winner = releaseToBuyer
            ? offer.buyer
            : offer.seller;

        withdrawable[winner] += offer.ethAmount;

        emit DisputeResolved(offerId, winner);
    }

    // ─────────────────────────────────────────────
    // Withdraw ETH (pull payments)
    // ─────────────────────────────────────────────

    function withdraw() external nonReentrant {

        uint256 amount = withdrawable[msg.sender];

        if (amount == 0) revert InvalidAmount();

        withdrawable[msg.sender] = 0;

        (bool success, ) =
            msg.sender.call{value: amount}("");

        if (!success) revert TransferFailed();

        emit Withdrawal(msg.sender, amount);
    }

    // ─────────────────────────────────────────────
    // View helpers
    // ─────────────────────────────────────────────

    function getOffer(uint256 offerId)
        external
        view
        returns (Offer memory)
    {
        return offers[offerId];
    }

    function getStatus(uint256 offerId)
        external
        view
        returns (string memory)
    {
        Status s = offers[offerId].status;

        if (s == Status.Open) return "Open";
        if (s == Status.Locked) return "Locked";
        if (s == Status.Completed) return "Completed";
        if (s == Status.Disputed) return "Disputed";

        return "Cancelled";
    }

    function timeLeft(uint256 offerId)
        external
        view
        returns (uint256)
    {
        Offer storage offer = offers[offerId];

        if (offer.status != Status.Locked)
            return 0;

        uint256 end =
            offer.lockedAt + LOCK_TIMEOUT;

        if (block.timestamp >= end)
            return 0;

        return end - block.timestamp;
    }
}
