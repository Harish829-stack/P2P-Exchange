const { ethers } = require("hardhat");
const fs = require("fs");

async function main() {
  console.log("=== Running Local End-to-End Integration Test for UI Functional Logic ===");
  
  const signers = await ethers.getSigners();
  const seller = signers[0];
  const buyer = signers[1];
  const arbitratorOwner = signers[2]; // Part of multisig

  const addressRaw = fs.readFileSync("./frontend/src/contracts/address.json");
  const { escrow: escrowAddr, multisig: multisigAddr } = JSON.parse(addressRaw);

  const P2PEscrow = await ethers.getContractFactory("P2PEscrow");
  const escrowSeller = P2PEscrow.attach(escrowAddr).connect(seller);
  const escrowBuyer = P2PEscrow.attach(escrowAddr).connect(buyer);

  const MultisigArbitrator = await ethers.getContractFactory("MultisigArbitrator");
  const multisigOwner = MultisigArbitrator.attach(multisigAddr).connect(arbitratorOwner);

  // 1. Seller lists an offer
  const fiatPrice = 300000; // $3000.00
  const ethValue = ethers.parseEther("1.0"); // 1 ETH
  
  console.log(`1. Seller (${seller.address}) listing 1 ETH for $3000...`);
  const tx1 = await escrowSeller.listOffer(fiatPrice, { value: ethValue });
  await tx1.wait();
  
  const nextId = await escrowSeller.nextOfferId();
  const offerId = Number(nextId) - 1;
  console.log(`   -> Offer listed successfully! ID: ${offerId}`);

  // 2. Buyer accepts the offer
  console.log(`2. Buyer (${buyer.address}) accepting offer #${offerId}...`);
  const tx2 = await escrowBuyer.acceptOffer(offerId);
  await tx2.wait();
  let offerState = await escrowSeller.getOffer(offerId);
  console.log(`   -> Offer state (Expected 1 for LOCKED): ${offerState.status}`);

  // 3. Open Dispute
  console.log(`3. Buyer opening a dispute...`);
  const tx3 = await escrowBuyer.openDispute(offerId);
  await tx3.wait();
  offerState = await escrowSeller.getOffer(offerId);
  console.log(`   -> Offer state (Expected 3 for DISPUTED): ${offerState.status}`);

  // 4. Resolve Dispute using MultisigArbitrator
  console.log(`4. Arbitrator (${arbitratorOwner.address}) voting to resolve dispute (Refund Buyer)...`);
  // The multisig arbitrates by executing a low-level call to Escrow.resolveDispute(offerId, true)
  const escrowIface = new ethers.Interface(P2PEscrow.interface.format());
  const calldata = escrowIface.encodeFunctionData("resolveDispute", [offerId, true]); // true = refund buyer
  
  const tx4 = await multisigOwner.submitTransaction(escrowAddr, 0, calldata);
  await tx4.wait();
  console.log("   -> Proposed transaction to Multisig.");
  
  // Since 2-of-3 is required, let's get signer[0] to confirm
  const multisigSigner0 = MultisigArbitrator.attach(multisigAddr).connect(seller); // seller is signers[0]
  const txCount = await multisigOwner.transactionCount();
  const mTxId = Number(txCount) - 1;
  
  const tx5 = await multisigSigner0.confirmTransaction(mTxId);
  await tx5.wait();
  console.log("   -> Second Arbitrator confirmed transaction.");

  // Execute
  const tx6 = await multisigOwner.executeTransaction(mTxId);
  await tx6.wait();
  console.log(`   -> Executed transaction from Multisig resolving dispute!`);

  offerState = await escrowSeller.getOffer(offerId);
  console.log(`   -> Offer state (Expected 4 for RESOLVED): ${offerState.status}`);
  console.log("=== Integration Test Completed Successfully ===");
}

main().catch(console.error);
