const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("P2P Exchange System (Multisig + Escrow)", function () {

    let multisig;
    let escrow;

    let owner1;
    let owner2;
    let owner3;

    let seller;
    let buyer;
    let attacker;

    const ETH = ethers.parseEther("1");

    beforeEach(async function () {

        [
            owner1,
            owner2,
            owner3,
            seller,
            buyer,
            attacker
        ] = await ethers.getSigners();

        // ─────────────────────────────
        // Deploy Multisig
        // ─────────────────────────────

        const Multisig = await ethers.getContractFactory("MultisigArbitrator");

        multisig = await Multisig.deploy(
            [
                owner1.address,
                owner2.address,
                owner3.address
            ],
            2 // threshold
        );

        await multisig.waitForDeployment();

        // ─────────────────────────────
        // Deploy Escrow
        // ─────────────────────────────

        const Escrow = await ethers.getContractFactory("P2PEscrow");

        escrow = await Escrow.deploy(
            await multisig.getAddress()
        );

        await escrow.waitForDeployment();

    });


    // =====================================================
    // MULTISIG TESTS
    // =====================================================

    describe("MultisigArbitrator", function () {

        it("should deploy with correct owners", async function () {

            const owners = await multisig.getOwners();

            expect(owners.length).to.equal(3);

            expect(owners).to.include(owner1.address);
            expect(owners).to.include(owner2.address);
            expect(owners).to.include(owner3.address);
        });


        it("should require 2 approvals before execution", async function () {

            // create offer
            await escrow
                .connect(seller)
                .listOffer(50000, {
                    value: ETH
                });

            // buyer accepts
            await escrow
                .connect(buyer)
                .acceptOffer(0);

            // open dispute
            await escrow
                .connect(buyer)
                .openDispute(0);

            // encode resolveDispute call
            const iface =
                new ethers.Interface([
                    "function resolveDispute(uint256,bool)"
                ]);

            const calldata =
                iface.encodeFunctionData(
                    "resolveDispute",
                    [0, true]
                );

            // submit tx
            await multisig
                .connect(owner1)
                .submitTx(
                    await escrow.getAddress(),
                    0,
                    calldata
                );

            // approve once
            await multisig
                .connect(owner1)
                .approveTx(0);

            // should fail before threshold
            await expect(
                multisig.executeTx(0)
            ).to.be.reverted;

            // second approval
            await multisig
                .connect(owner2)
                .approveTx(0);

            // should succeed now
            await multisig.executeTx(0);

            const withdrawable =
                await escrow.withdrawable(
                    buyer.address
                );

            expect(withdrawable)
                .to.equal(ETH);
        });


        it("should prevent double approval", async function () {

            await multisig
                .connect(owner1)
                .submitTx(
                    owner2.address,
                    0,
                    "0x"
                );

            await multisig.connect(owner1).approveTx(0);

            await expect(
                multisig.connect(owner1).approveTx(0)
            ).to.be.reverted;
        });

    });



    // =====================================================
    // ESCROW TESTS
    // =====================================================

    describe("P2PEscrow", function () {

        it("seller can list offer", async function () {

            await escrow
                .connect(seller)
                .listOffer(50000, {
                    value: ETH
                });

            const offer =
                await escrow.getOffer(0);

            expect(offer.ethAmount)
                .to.equal(ETH);

            expect(offer.seller)
                .to.equal(seller.address);
        });



        it("buyer can accept offer", async function () {

            await escrow
                .connect(seller)
                .listOffer(50000, {
                    value: ETH
                });

            await escrow
                .connect(buyer)
                .acceptOffer(0);

            const offer =
                await escrow.getOffer(0);

            expect(offer.buyer)
                .to.equal(buyer.address);
        });



        it("seller can release funds", async function () {

            await escrow
                .connect(seller)
                .listOffer(50000, {
                    value: ETH
                });

            await escrow
                .connect(buyer)
                .acceptOffer(0);

            await escrow
                .connect(seller)
                .releaseFunds(0);

            const withdrawable =
                await escrow.withdrawable(
                    buyer.address
                );

            expect(withdrawable)
                .to.equal(ETH);
        });



        it("buyer can withdraw ETH", async function () {

            await escrow
                .connect(seller)
                .listOffer(50000, {
                    value: ETH
                });

            await escrow
                .connect(buyer)
                .acceptOffer(0);

            await escrow
                .connect(seller)
                .releaseFunds(0);

            const before =
                await ethers.provider.getBalance(
                    buyer.address
                );

            const tx =
                await escrow
                    .connect(buyer)
                    .withdraw();

            const receipt = await tx.wait();

            const gasUsed =
                receipt.gasUsed *
                receipt.gasPrice;

            const after =
                await ethers.provider.getBalance(
                    buyer.address
                );

            expect(after)
                .to.be.gt(before);
        });



        it("seller can cancel after timeout", async function () {

            await escrow
                .connect(seller)
                .listOffer(50000, {
                    value: ETH
                });

            await escrow
                .connect(buyer)
                .acceptOffer(0);

            await ethers.provider.send(
                "evm_increaseTime",
                [86400]
            );

            await ethers.provider.send(
                "evm_mine"
            );

            await escrow
                .connect(seller)
                .cancelAfterTimeout(0);

            const withdrawable =
                await escrow.withdrawable(
                    seller.address
                );

            expect(withdrawable)
                .to.equal(ETH);
        });

    });



    // =====================================================
    // INTEGRATION TEST
    // =====================================================

    describe("Integration: Multisig resolves dispute", function () {

        it("multisig should resolve dispute", async function () {

            // seller lists offer
            await escrow
                .connect(seller)
                .listOffer(50000, {
                    value: ETH
                });

            // buyer accepts
            await escrow
                .connect(buyer)
                .acceptOffer(0);

            // open dispute
            await escrow
                .connect(buyer)
                .openDispute(0);

            // prepare calldata for resolveDispute
            const iface =
                new ethers.Interface([
                    "function resolveDispute(uint256,bool)"
                ]);

            const calldata =
                iface.encodeFunctionData(
                    "resolveDispute",
                    [0, true] // release to buyer
                );

            // submit tx to multisig
            await multisig
                .connect(owner1)
                .submitTx(
                    await escrow.getAddress(),
                    0,
                    calldata
                );

            // approvals
            await multisig
                .connect(owner1)
                .approveTx(0);

            await multisig
                .connect(owner2)
                .approveTx(0);

            // execute
            await multisig.executeTx(0);

            const withdrawable =
                await escrow.withdrawable(
                    buyer.address
                );

            expect(withdrawable)
                .to.equal(ETH);
        });

    });

});