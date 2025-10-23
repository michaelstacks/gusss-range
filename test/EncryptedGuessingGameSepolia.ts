import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm, deployments } from "hardhat";
import { EncryptedGuessingGame } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("EncryptedGuessingGameSepolia", function () {
  let signer: Signers;
  let game: EncryptedGuessingGame;
  let contractAddress: string;
  let step = 0;
  let steps = 0;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn("This test runs only against Sepolia deployments");
      this.skip();
    }

    const deployment = await deployments.get("EncryptedGuessingGame");
    contractAddress = deployment.address;
    game = (await ethers.getContractAt(
      "EncryptedGuessingGame",
      deployment.address,
    )) as EncryptedGuessingGame;

    const ethSigners = await ethers.getSigners();
    signer = { alice: ethSigners[0] };
  });

  beforeEach(() => {
    step = 0;
    steps = 0;
  });

  it("joins the game and decrypts a result", async function () {
    steps = 9;
    this.timeout(4 * 40000);

    await fhevm.initializeCLIApi();

    progress("Fetching entry fee");
    const entryFee = await game.entryFee();

    progress("Sending joinGame transaction");
    const joinTx = await game.connect(signer.alice).joinGame({ value: entryFee });
    await joinTx.wait();

    progress("Encrypting guess value 10");
    const encryptedGuess = await fhevm
      .createEncryptedInput(contractAddress, signer.alice.address)
      .add32(10)
      .encrypt();

    progress("Submitting guess");
    const guessTx = await game
      .connect(signer.alice)
      .submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    await guessTx.wait();

    progress("Retrieving encrypted result");
    const encryptedResult = await game.getLatestResult(signer.alice.address);

    progress("Decrypting result");
    const clearResult = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedResult,
      contractAddress,
      signer.alice,
    );

    progress(`Decrypted result ${clearResult}`);
    expect(clearResult).to.be.oneOf([1n, 2n, 3n, 4n]);
  });
});
