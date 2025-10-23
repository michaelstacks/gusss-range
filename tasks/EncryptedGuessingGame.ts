import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const CONTRACT_NAME = "EncryptedGuessingGame";

task("task:address", "Prints the EncryptedGuessingGame address").setAction(async function (_taskArguments: TaskArguments, hre) {
  const deployment = await hre.deployments.get(CONTRACT_NAME);
  console.log(`${CONTRACT_NAME} address is ${deployment.address}`);
});

task("task:join-game", "Pays the entry fee and joins the encrypted guessing game")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;

    const deployment = taskArguments.address
      ? { address: taskArguments.address as string }
      : await deployments.get(CONTRACT_NAME);

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);
    const entryFee = await contract.entryFee();

    const tx = await contract.connect(signer).joinGame({ value: entryFee });
    console.log(`Waiting for join tx: ${tx.hash} ...`);
    const receipt = await tx.wait();
    console.log(`joinGame status: ${receipt?.status}`);
  });

task("task:submit-guess", "Encrypts a guess and submits it to the contract")
  .addOptionalParam("address", "Optionally specify the contract address")
  .addParam("value", "Guess value between 1 and 20")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    const guess = parseInt(taskArguments.value as string, 10);
    if (!Number.isInteger(guess) || guess < 1 || guess > 20) {
      throw new Error("--value must be an integer between 1 and 20");
    }

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address as string }
      : await deployments.get(CONTRACT_NAME);

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const encryptedGuess = await fhevm
      .createEncryptedInput(deployment.address, signer.address)
      .add32(guess)
      .encrypt();

    const tx = await contract
      .connect(signer)
      .submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    console.log(`Waiting for submitGuess tx: ${tx.hash} ...`);
    const receipt = await tx.wait();
    console.log(`submitGuess status: ${receipt?.status}`);

    const encryptedResult = await contract.getLatestResult(signer.address);
    console.log(`Encrypted result: ${encryptedResult}`);
  });

task("task:decrypt-result", "Decrypts the latest stored result for the signer")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const deployment = taskArguments.address
      ? { address: taskArguments.address as string }
      : await deployments.get(CONTRACT_NAME);

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const encryptedResult = await contract.getLatestResult(signer.address);
    if (encryptedResult === ethers.ZeroHash) {
      console.log("No result stored yet.");
      return;
    }

    const clearResult = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedResult,
      deployment.address,
      signer,
    );
    console.log(`Encrypted result: ${encryptedResult}`);
    console.log(`Decrypted result: ${clearResult}`);
  });
