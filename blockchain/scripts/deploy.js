// scripts/deploy.js
// ─────────────────────────────────────────────────────────────────────────────
// Deploy Script: P2P Exchange System
//
// Deployment Order:
//   1. Deploy MultisigArbitrator  (3 owners, threshold = 2)
//   2. Deploy P2PEscrow           (passing MultisigArbitrator address)
//
// The Multisig acts as the sole arbitrator for the Escrow.
// Only the Multisig (msg.sender == multisig.address) can call resolveDispute().
// ─────────────────────────────────────────────────────────────────────────────

const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("       P2P Exchange  –  Deployment Script");
  console.log("═══════════════════════════════════════════════════════\n");

  // ── 1. Signers ────────────────────────────────────────────────────────────
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  // Use three separate accounts as the multisig owners
  // In production these would be real separate hardware wallets / keys
  const owner1 = signers[0];
  const owner2 = signers[1];
  const owner3 = signers[2];

  console.log("📦  Deployer       :", deployer.address);
  console.log("👤  Multisig Owner1:", owner1.address);
  console.log("👤  Multisig Owner2:", owner2.address);
  console.log("👤  Multisig Owner3:", owner3.address);
  console.log();

  // ── 2. Deploy MultisigArbitrator ─────────────────────────────────────────
  //       3 owners, threshold of 2   →   2-of-3 multisig
  console.log("🚀  Step 1 — Deploying MultisigArbitrator (2-of-3)...");

  const MultisigArbitrator = await ethers.getContractFactory(
    "MultisigArbitrator"
  );

  const owners = [owner1.address, owner2.address, owner3.address];
  const threshold = 2; // 2 out of 3 owners must approve

  const multisig = await MultisigArbitrator.deploy(owners, threshold);
  await multisig.waitForDeployment();

  const multisigAddress = await multisig.getAddress();
  console.log("✅  MultisigArbitrator deployed at:", multisigAddress);
  console.log("    Owners    :", owners);
  console.log("    Threshold :", threshold, "of", owners.length);
  console.log();

  // ── 3. Deploy P2PEscrow ───────────────────────────────────────────────────
  //       Pass the Multisig's address as the sole arbitrator.
  //       Only calls from multisig.address will pass the onlyArbitrator guard.
  console.log("🚀  Step 2 — Deploying P2PEscrow...");
  console.log("    Arbitrator set to MultisigArbitrator:", multisigAddress);

  const P2PEscrow = await ethers.getContractFactory("P2PEscrow");
  const escrow = await P2PEscrow.deploy(multisigAddress);
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  console.log("✅  P2PEscrow deployed at:", escrowAddress);
  console.log(
    "    escrow.arbitrator() ==",
    await escrow.arbitrator()
  );
  console.log();

  // ── 4. Sanity check – verify the linkage ─────────────────────────────────
  const linkedArbitrator = await escrow.arbitrator();
  const isLinked = linkedArbitrator.toLowerCase() === multisigAddress.toLowerCase();

  if (!isLinked) {
    throw new Error(
      `❌  Arbitrator mismatch!\n` +
      `    Expected: ${multisigAddress}\n` +
      `    Got:      ${linkedArbitrator}`
    );
  }

  console.log("🔗  Contract linkage verified:");
  console.log("    P2PEscrow.arbitrator() → MultisigArbitrator ✓");
  console.log(
    "    Only the MultisigArbitrator can call resolveDispute() ✓"
  );
  console.log();

  // ── 5. Export addresses + ABIs ────────────────────────────────────────────
  const network = await ethers.provider.getNetwork();
  const deploymentInfo = {
    network: hre.network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      MultisigArbitrator: {
        address: multisigAddress,
        owners: owners,
        threshold: threshold,
        abi: (await hre.artifacts.readArtifact("MultisigArbitrator")).abi,
      },
      P2PEscrow: {
        address: escrowAddress,
        arbitrator: multisigAddress,
        abi: (await hre.artifacts.readArtifact("P2PEscrow")).abi,
      },
    },
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `${hre.network.name}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deploymentInfo, null, 2));

  console.log("📄  Deployment info saved to:", outFile);
  console.log();

  // ── 6. Summary ────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════════");
  console.log("  DEPLOYMENT SUMMARY");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Network              : ${hre.network.name}`);
  console.log(`  MultisigArbitrator   : ${multisigAddress}`);
  console.log(`  P2PEscrow            : ${escrowAddress}`);
  console.log(`  Multisig Threshold   : ${threshold}-of-${owners.length}`);
  console.log("═══════════════════════════════════════════════════════\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌  Deployment failed:", error);
    process.exit(1);
  });
