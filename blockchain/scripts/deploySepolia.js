const { ethers } = require("hardhat");

async function main() {

    const [deployer,signer2,signer3] = await ethers.getSigners();

    console.log("Deploying with:", deployer.address);


    const owners = [
        deployer.address,
        signer2.address,
        signer3.address
    ];

    const threshold = 2;

    const Multisig = await ethers.getContractFactory("MultisigArbitrator");

    const multisig = await Multisig.deploy(
        owners,
        threshold
    );

    await multisig.waitForDeployment();

    console.log(
        "Multisig deployed at:",
        await multisig.getAddress()
    );


    /*
        2. Deploy escrow with multisig address
    */

    const Escrow = await ethers.getContractFactory("P2PEscrow");

    const escrow = await Escrow.deploy(
        await multisig.getAddress()
    );

    await escrow.waitForDeployment();

    console.log(
        "Escrow deployed at:",
        await escrow.getAddress()
    );

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});


/**
 * npx hardhat run scripts/deploySepolia.js --network sepolia
[dotenv@17.3.1] injecting env (15) from .env -- tip: ⚙️  specify custom .env file path with { path: '/custom/path/.env' }
[dotenv@17.3.1] injecting env (0) from .env -- tip: ⚡️ secrets for agents: https://dotenvx.com/as2
Deploying with: 0x878344AF84A404439Ea37cFB9b30DeFd7938741C
Multisig deployed at: 0x6D9fa2049871E3A289e1b02802CCF2766A273934
Escrow deployed at: 0xC71BFb170CB1133D3dD3F587B0E9BFAD848a2aAd
harish@harish-Vostro:~/Desktop/Hackathon/blockchain$ 
 */