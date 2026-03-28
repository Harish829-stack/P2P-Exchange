// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Multisig Arbitrator (Production-style)
 * @notice Multi-signature wallet specialized for dispute resolution in escrow systems
 *
 * Features:
 *  - Multiple arbitrators
 *  - Threshold approvals required
 *  - Replay protection via nonce
 *  - Gas optimized
 *  - Compatible with escrow resolveDispute()
 *  - Production-grade patterns
 */

contract MultisigArbitrator {

    // ─────────────────────────────────────────────
    // Errors (gas efficient)
    // ─────────────────────────────────────────────

    error NotOwner();
    error AlreadyApproved();
    error TxAlreadyExecuted();
    error InvalidThreshold();
    error InvalidOwner();
    error ExecutionFailed();

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event SubmitTx(
        uint256 indexed txId,
        address indexed target,
        uint256 value
    );

    event ApproveTx(
        address indexed owner,
        uint256 indexed txId
    );

    event ExecuteTx(
        uint256 indexed txId
    );

    event OwnerAdded(address owner);
    event OwnerRemoved(address owner);

    // ─────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────

    struct Transaction {
        address target;
        uint256 value;
        bytes data;
        bool executed;
        uint256 approvals;
    }

    address[] public owners;

    mapping(address => bool)
        public isOwner;

    uint256 public immutable threshold;

    uint256 public nextTxId;

    mapping(uint256 => Transaction)
        public transactions;

    mapping(uint256 => mapping(address => bool))
        public approved;

    // ─────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────

    modifier onlyOwner() {
        if (!isOwner[msg.sender])
            revert NotOwner();
        _;
    }

    modifier txExists(uint256 txId) {
        require(txId < nextTxId);
        _;
    }

    modifier notExecuted(uint256 txId) {
        if (transactions[txId].executed)
            revert TxAlreadyExecuted();
        _;
    }

    modifier notApproved(uint256 txId) {
        if (approved[txId][msg.sender])
            revert AlreadyApproved();
        _;
    }

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    constructor(
        address[] memory _owners,
        uint256 _threshold
    ) {

        if (
            _threshold == 0 ||
            _threshold > _owners.length
        )
            revert InvalidThreshold();

        for (uint256 i; i < _owners.length; i++) {

            address owner = _owners[i];

            if (
                owner == address(0) ||
                isOwner[owner]
            )
                revert InvalidOwner();

            isOwner[owner] = true;
            owners.push(owner);

            emit OwnerAdded(owner);
        }

        threshold = _threshold;
    }

    // ─────────────────────────────────────────────
    // Submit transaction
    // ─────────────────────────────────────────────

    function submitTx(
        address target,
        uint256 value,
        bytes calldata data
    )
        external
        onlyOwner
        returns (uint256 txId)
    {

        txId = nextTxId++;

        transactions[txId] = Transaction({

            target: target,
            value: value,
            data: data,
            executed: false,
            approvals: 0
        });

        emit SubmitTx(
            txId,
            target,
            value
        );
    }

    // ─────────────────────────────────────────────
    // Approve transaction
    // ─────────────────────────────────────────────

    function approveTx(
        uint256 txId
    )
        external
        onlyOwner
        txExists(txId)
        notExecuted(txId)
        notApproved(txId)
    {

        approved[txId][msg.sender] = true;

        transactions[txId].approvals++;

        emit ApproveTx(
            msg.sender,
            txId
        );
    }

    // ─────────────────────────────────────────────
    // Execute after threshold approvals
    // ─────────────────────────────────────────────

    function executeTx(
        uint256 txId
    )
        external
        txExists(txId)
        notExecuted(txId)
    {

        Transaction storage txn =
            transactions[txId];

        if (txn.approvals < threshold)
            revert InvalidThreshold();

        txn.executed = true;

        (bool ok, ) =
            txn.target.call{value: txn.value}(
                txn.data
            );

        if (!ok)
            revert ExecutionFailed();

        emit ExecuteTx(txId);
    }

    // ─────────────────────────────────────────────
    // View helpers
    // ─────────────────────────────────────────────

    function getOwners()
        external
        view
        returns (address[] memory)
    {
        return owners;
    }

    function getTx(
        uint256 txId
    )
        external
        view
        returns (Transaction memory)
    {
        return transactions[txId];
    }

    receive() external payable {}
}
