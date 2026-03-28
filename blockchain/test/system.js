// test/system.js
// ─────────────────────────────────────────────────────────────────────────────
// System Integration Test: P2P Exchange Dispute Flow
//
// Tests use ethers v6 API (bundled with @nomicfoundation/hardhat-toolbox@hh2)
//
// Key demonstration:
//   The multisig owners encode resolveDispute(offerId, releaseToBuyer)
//   into ABI-encoded bytes and pass it through submitTx → approveTx → executeTx.
//   The Multisig contract then calls escrow.resolveDispute() as msg.sender,
//   which satisfies the onlyArbitrator guard.
// ─────────────────────────────────────────────────────────────────────────────

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// ─────────────────────────────────────────────────────────────────────────────
// Helper: encode resolveDispute calldata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * encodeResolveDispute
 *
 * ABI-encodes a call to P2PEscrow.resolveDispute(uint256 offerId, bool releaseToBuyer).
 *
 * This is the critical piece: the multisig doesn't call Solidity functions
 * directly — it stores raw bytes and forwards them via a low-level .call().
 * We use the contract's Interface object to generate the canonical ABI encoding:
 *   4-byte function selector + abi.encode(offerId, releaseToBuyer)
 *
 * @param {ethers.Contract} escrow  - The P2PEscrow contract instance
 * @param {number} offerId          - The offer being disputed
 * @param {boolean} releaseToBuyer  - true = buyer wins, false = seller wins
 * @returns {string} hex-encoded calldata bytes
 */
function encodeResolveDispute(escrow, offerId, releaseToBuyer) {
  return escrow.interface.encodeFunctionData("resolveDispute", [
    offerId,
    releaseToBuyer,
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: fresh deployment for every test
// ─────────────────────────────────────────────────────────────────────────────

async function deployFixture() {
  const [deployer, owner1, owner2, owner3, seller, buyer, stranger] =
    await ethers.getSigners();

  // ── Deploy MultisigArbitrator: 2-of-3 ──────────────────────────────────
  const MultisigArbitrator = await ethers.getContractFactory(
    "MultisigArbitrator"
  );
  const multisig = await MultisigArbitrator.deploy(
    [owner1.address, owner2.address, owner3.address],
    2 // threshold = 2-of-3
  );
  await multisig.waitForDeployment();
  const multisigAddress = await multisig.getAddress();

  // ── Deploy P2PEscrow, arbitrator = multisig address ───────────────────
  const P2PEscrow = await ethers.getContractFactory("P2PEscrow");
  const escrow = await P2PEscrow.deploy(multisigAddress);
  await escrow.waitForDeployment();

  return {
    multisig,
    multisigAddress,
    escrow,
    deployer,
    owner1,
    owner2,
    owner3,
    seller,
    buyer,
    stranger,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("P2P Exchange — System Integration Tests", function () {
  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 1: Deployment & Linkage
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Deployment & Contract Linkage", function () {
    it("should deploy MultisigArbitrator with correct owners and threshold", async function () {
      const { multisig, owner1, owner2, owner3 } = await loadFixture(
        deployFixture
      );

      expect(await multisig.threshold()).to.equal(2n);
      expect(await multisig.isOwner(owner1.address)).to.be.true;
      expect(await multisig.isOwner(owner2.address)).to.be.true;
      expect(await multisig.isOwner(owner3.address)).to.be.true;

      const owners = await multisig.getOwners();
      expect(owners.length).to.equal(3);

      console.log("     ✓ MultisigArbitrator: threshold=2, owners=3");
    });

    it("should deploy P2PEscrow with MultisigArbitrator as arbitrator", async function () {
      const { multisigAddress, escrow } = await loadFixture(deployFixture);

      expect(await escrow.arbitrator()).to.equal(multisigAddress);
      console.log("     ✓ P2PEscrow.arbitrator() == MultisigArbitrator.address");
    });

    it("should reject direct resolveDispute calls from non-arbitrator", async function () {
      const { escrow, seller, buyer, stranger } = await loadFixture(
        deployFixture
      );

      const ONE_ETH = ethers.parseEther("1.0");
      await escrow.connect(seller).listOffer(50000n, { value: ONE_ETH });
      await escrow.connect(buyer).acceptOffer(0);
      await escrow.connect(buyer).openDispute(0);

      // Stranger (not the multisig) tries to resolve — must revert
      await expect(
        escrow.connect(stranger).resolveDispute(0, true)
      ).to.be.revertedWithCustomError(escrow, "NotArbitrator");

      // Even seller cannot resolve directly
      await expect(
        escrow.connect(seller).resolveDispute(0, true)
      ).to.be.revertedWithCustomError(escrow, "NotArbitrator");

      console.log(
        "     ✓ resolveDispute() reverts NotArbitrator for all non-multisig callers"
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 2: Escrow Happy Path (no dispute)
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. Escrow — Happy Path", function () {
    it("should complete the full trade: list → accept → release → withdraw", async function () {
      const { escrow, seller, buyer } = await loadFixture(deployFixture);

      const ONE_ETH = ethers.parseEther("1.0");

      // List
      await expect(
        escrow.connect(seller).listOffer(50000n, { value: ONE_ETH })
      ).to.emit(escrow, "OfferListed");

      expect(await escrow.getStatus(0)).to.equal("Open");

      // Accept
      await expect(escrow.connect(buyer).acceptOffer(0)).to.emit(
        escrow,
        "OfferAccepted"
      );
      expect(await escrow.getStatus(0)).to.equal("Locked");

      // Release
      await expect(escrow.connect(seller).releaseFunds(0)).to.emit(
        escrow,
        "FundsReleased"
      );
      expect(await escrow.getStatus(0)).to.equal("Completed");
      expect(await escrow.withdrawable(buyer.address)).to.equal(ONE_ETH);

      // Withdraw
      const before = await ethers.provider.getBalance(buyer.address);
      const tx = await escrow.connect(buyer).withdraw();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(buyer.address);

      // after ≈ before + 1 ETH - gas
      const expected = before + ONE_ETH - gasUsed;
      expect(after).to.be.closeTo(expected, ethers.parseEther("0.001"));

      console.log("     ✓ Full happy path: list → accept → release → withdraw");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 3: Dispute Resolution via Multisig (CORE DEMONSTRATION)
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. Dispute Resolution via MultisigArbitrator", function () {
    /**
     * CORE DEMONSTRATION
     *
     * The 2-of-3 multisig acts as the sole arbitrator for P2PEscrow.
     * To call escrow.resolveDispute(), owners must:
     *
     *   Step A: Encode the calldata using ABI encoding
     *           calldata = abi.encodeWithSignature("resolveDispute(uint256,bool)", offerId, winner)
     *
     *   Step B: One owner calls multisig.submitTx(escrow, 0, calldata) → txId
     *
     *   Step C: Owners approve with multisig.approveTx(txId)
     *           (need ≥ threshold approvals)
     *
     *   Step D: Anyone calls multisig.executeTx(txId)
     *           → multisig.call{value:0}(calldata) on escrow
     *           → msg.sender inside escrow == multisig.address ✓
     *           → onlyArbitrator guard passes ✓
     */
    it("DEMO: should resolve dispute in buyer's favor via 2-of-3 multisig approval", async function () {
      const { multisig, multisigAddress, escrow, owner1, owner2, seller, buyer } =
        await loadFixture(deployFixture);

      const ONE_ETH = ethers.parseEther("1.0");
      const OFFER_ID = 0;

      // ── Phase 1: Setup disputed offer ────────────────────────────────
      console.log("\n     📋 Phase 1: Setting up disputed offer...");

      await escrow.connect(seller).listOffer(50000n, { value: ONE_ETH });
      await escrow.connect(buyer).acceptOffer(OFFER_ID);
      await escrow.connect(buyer).openDispute(OFFER_ID);

      expect(await escrow.getStatus(OFFER_ID)).to.equal("Disputed");
      console.log("        Offer status: Disputed ✓");

      // ── Phase 2: Encode the resolveDispute calldata ───────────────────
      console.log("\n     🔐 Phase 2: Encoding resolveDispute calldata...");

      const releaseToBuyer = true; // buyer wins

      const encodedCalldata = encodeResolveDispute(
        escrow,
        OFFER_ID,
        releaseToBuyer
      );

      const selector = escrow.interface.getFunction("resolveDispute").selector;

      console.log("        Function   : resolveDispute(uint256 offerId, bool releaseToBuyer)");
      console.log("        Selector   :", selector);
      console.log("        Arguments  : offerId =", OFFER_ID, ", releaseToBuyer =", releaseToBuyer);
      console.log("        Encoded TX :", encodedCalldata);
      console.log("        (First 4 bytes = selector, remaining = ABI-encoded args)");

      // ── Phase 3: Owner1 submits the transaction to the multisig ──────
      console.log("\n     📨 Phase 3: Owner1 submits TX to multisig...");

      await expect(
        multisig
          .connect(owner1)
          .submitTx(
            await escrow.getAddress(), // target = P2PEscrow address
            0n,                        // value  = 0 ETH (no ETH sent)
            encodedCalldata            // data   = ABI-encoded resolveDispute
          )
      ).to.emit(multisig, "SubmitTx");

      const txId = 0;
      const storedTx = await multisig.getTx(txId);
      expect(storedTx.target).to.equal(await escrow.getAddress());
      expect(storedTx.executed).to.be.false;
      expect(storedTx.data).to.equal(encodedCalldata);

      console.log("        Multisig txId   :", txId);
      console.log("        Target          :", storedTx.target, "(= P2PEscrow)");
      console.log("        Data stored     :", storedTx.data);
      console.log("        ✓ calldata stored in multisig pending approvals");

      // ── Phase 4: Owner1 approves (1st approval) ───────────────────────
      console.log("\n     👍 Phase 4: Owner1 approves (1 of 2 needed)...");

      await expect(multisig.connect(owner1).approveTx(txId))
        .to.emit(multisig, "ApproveTx")
        .withArgs(owner1.address, txId);

      let txState = await multisig.getTx(txId);
      expect(txState.approvals).to.equal(1n);
      console.log("        Approvals: 1 / 2 (threshold not yet met)");

      // Execution should still revert — threshold not met
      await expect(
        multisig.connect(owner1).executeTx(txId)
      ).to.be.revertedWithCustomError(multisig, "InvalidThreshold");
      console.log("        executeTx() correctly reverts before threshold ✓");

      // ── Phase 5: Owner2 approves — threshold met ──────────────────────
      console.log("\n     👍 Phase 5: Owner2 approves (2 of 2 — threshold met!)...");

      await expect(multisig.connect(owner2).approveTx(txId))
        .to.emit(multisig, "ApproveTx")
        .withArgs(owner2.address, txId);

      txState = await multisig.getTx(txId);
      expect(txState.approvals).to.equal(2n);
      console.log("        Approvals: 2 / 2 ✓ — threshold reached, execution unlocked");

      // ── Phase 6: Execute — multisig calls escrow.resolveDispute() ────
      console.log("\n     ⚡ Phase 6: Executing multisig transaction...");
      console.log("        multisig.executeTx() will low-level call:");
      console.log("        escrow.call(encodedCalldata)");
      console.log("        → inside escrow: msg.sender == multisig.address");
      console.log("        → onlyArbitrator guard: msg.sender == arbitrator ✓");

      const buyerBefore = await escrow.withdrawable(buyer.address);
      expect(buyerBefore).to.equal(0n);

      await expect(multisig.connect(owner1).executeTx(txId))
        .to.emit(multisig, "ExecuteTx")
        .withArgs(txId)
        .and.to.emit(escrow, "DisputeResolved")
        .withArgs(OFFER_ID, buyer.address);

      // ── Phase 7: Verify outcomes ──────────────────────────────────────
      console.log("\n     ✅ Phase 7: Verifying outcomes...");

      expect(await escrow.getStatus(OFFER_ID)).to.equal("Completed");
      console.log("        Offer status     : Completed ✓");

      const buyerWithdrawable = await escrow.withdrawable(buyer.address);
      expect(buyerWithdrawable).to.equal(ONE_ETH);
      console.log(
        "        Buyer withdrawable:",
        ethers.formatEther(buyerWithdrawable),
        "ETH ✓"
      );

      expect(await escrow.withdrawable(seller.address)).to.equal(0n);
      console.log("        Seller withdrawable: 0 ETH ✓");

      // ── Phase 8: Buyer withdraws ──────────────────────────────────────
      console.log("\n     💰 Phase 8: Buyer withdraws...");

      await expect(escrow.connect(buyer).withdraw())
        .to.emit(escrow, "Withdrawal")
        .withArgs(buyer.address, ONE_ETH);

      expect(await escrow.withdrawable(buyer.address)).to.equal(0n);
      console.log("        Buyer successfully withdrew 1 ETH ✓");
      console.log();
    });

    it("DEMO: should resolve dispute in seller's favor (releaseToBuyer=false)", async function () {
      const { multisig, escrow, owner1, owner2, owner3, seller, buyer } =
        await loadFixture(deployFixture);

      const TWO_ETH = ethers.parseEther("2.0");
      const OFFER_ID = 0;

      // Setup dispute
      await escrow.connect(seller).listOffer(100000n, { value: TWO_ETH });
      await escrow.connect(buyer).acceptOffer(OFFER_ID);
      await escrow.connect(seller).openDispute(OFFER_ID);

      // Encode: buyer loses (releaseToBuyer = false)
      const encodedCalldata = encodeResolveDispute(escrow, OFFER_ID, false);

      console.log("\n     🔐 Encoding resolveDispute(0, false) — seller wins");
      console.log("        Encoded:", encodedCalldata);

      // Submit → Approve (owner1 + owner3) → Execute by owner2
      await multisig.connect(owner1).submitTx(await escrow.getAddress(), 0n, encodedCalldata);
      await multisig.connect(owner1).approveTx(0);
      await multisig.connect(owner3).approveTx(0); // using owner3 instead of owner2

      await expect(multisig.connect(owner2).executeTx(0))
        .to.emit(escrow, "DisputeResolved")
        .withArgs(OFFER_ID, seller.address);

      expect(await escrow.withdrawable(seller.address)).to.equal(TWO_ETH);
      expect(await escrow.withdrawable(buyer.address)).to.equal(0n);

      console.log("     ✓ Seller wins — seller.withdrawable = 2 ETH ✓");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 4: Multisig Security Guards
  // ──────────────────────────────────────────────────────────────────────────
  describe("4. Multisig Security Guards", function () {
    it("should prevent non-owners from submitting transactions", async function () {
      const { multisig, escrow, stranger } = await loadFixture(deployFixture);

      const fakeCalldata = encodeResolveDispute(escrow, 0, true);

      await expect(
        multisig.connect(stranger).submitTx(await escrow.getAddress(), 0n, fakeCalldata)
      ).to.be.revertedWithCustomError(multisig, "NotOwner");

      console.log("     ✓ Non-owners cannot submitTx");
    });

    it("should prevent double-approval by the same owner", async function () {
      const { multisig, escrow, owner1 } = await loadFixture(deployFixture);

      const calldata = encodeResolveDispute(escrow, 0, true);
      await multisig.connect(owner1).submitTx(await escrow.getAddress(), 0n, calldata);
      await multisig.connect(owner1).approveTx(0);

      await expect(
        multisig.connect(owner1).approveTx(0)
      ).to.be.revertedWithCustomError(multisig, "AlreadyApproved");

      console.log("     ✓ Same owner cannot approve twice");
    });

    it("should prevent executing an already executed transaction", async function () {
      const { multisig, escrow, owner1, owner2, seller, buyer } =
        await loadFixture(deployFixture);

      const ONE_ETH = ethers.parseEther("1.0");
      await escrow.connect(seller).listOffer(50000n, { value: ONE_ETH });
      await escrow.connect(buyer).acceptOffer(0);
      await escrow.connect(buyer).openDispute(0);

      const calldata = encodeResolveDispute(escrow, 0, true);
      await multisig.connect(owner1).submitTx(await escrow.getAddress(), 0n, calldata);
      await multisig.connect(owner1).approveTx(0);
      await multisig.connect(owner2).approveTx(0);
      await multisig.connect(owner1).executeTx(0); // execute once ✓

      // Second execution must revert
      await expect(
        multisig.connect(owner2).executeTx(0)
      ).to.be.revertedWithCustomError(multisig, "TxAlreadyExecuted");

      console.log("     ✓ Cannot replay an already-executed transaction");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 5: Escrow Edge Cases
  // ──────────────────────────────────────────────────────────────────────────
  describe("5. Escrow Edge Cases", function () {
    it("should prevent seller from buying their own offer", async function () {
      const { escrow, seller } = await loadFixture(deployFixture);

      const ONE_ETH = ethers.parseEther("1.0");
      await escrow.connect(seller).listOffer(50000n, { value: ONE_ETH });

      await expect(
        escrow.connect(seller).acceptOffer(0)
      ).to.be.revertedWithCustomError(escrow, "CannotBuyOwnOffer");

      console.log("     ✓ Seller cannot buy their own offer");
    });

    it("should allow seller to cancel before a buyer accepts", async function () {
      const { escrow, seller } = await loadFixture(deployFixture);

      const ONE_ETH = ethers.parseEther("1.0");
      await escrow.connect(seller).listOffer(50000n, { value: ONE_ETH });

      await expect(escrow.connect(seller).cancelOffer(0))
        .to.emit(escrow, "OfferCancelled")
        .withArgs(0);

      expect(await escrow.withdrawable(seller.address)).to.equal(ONE_ETH);
      expect(await escrow.getStatus(0)).to.equal("Cancelled");

      console.log("     ✓ Seller can cancel open offer and reclaim ETH");
    });

    it("should reject opening dispute on a non-Locked offer", async function () {
      const { escrow, seller, buyer } = await loadFixture(deployFixture);

      const ONE_ETH = ethers.parseEther("1.0");
      await escrow.connect(seller).listOffer(50000n, { value: ONE_ETH });

      // Offer is Open, not Locked → dispute must fail
      await expect(
        escrow.connect(buyer).openDispute(0)
      ).to.be.revertedWithCustomError(escrow, "InvalidStatus");

      console.log("     ✓ Cannot open dispute on non-Locked offer");
    });
  });
});
