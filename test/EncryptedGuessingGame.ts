import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { EncryptedGuessingGame, EncryptedGuessingGame__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployGame() {
  const factory = (await ethers.getContractFactory("EncryptedGuessingGame")) as EncryptedGuessingGame__factory;
  const game = (await factory.deploy()) as EncryptedGuessingGame;
  const address = await game.getAddress();
  return { game, address };
}

describe("EncryptedGuessingGame", function () {
  let signers: Signers;
  let game: EncryptedGuessingGame;
  let contractAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = {
      deployer: ethSigners[0],
      alice: ethSigners[1],
      bob: ethSigners[2],
    };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("Skipping local tests outside of the FHE mock environment");
      this.skip();
    }

    const deployment = await deployGame();
    game = deployment.game;
    contractAddress = deployment.address;
  });

  it("requires the exact entry fee", async function () {
    const entryFee = await game.entryFee();
    await expect(game.connect(signers.alice).joinGame({ value: entryFee - 1n })).to.be.revertedWithCustomError(
      game,
      "InvalidEntryFee",
    );

    await expect(game.connect(signers.alice).joinGame({ value: entryFee + 1n })).to.be.revertedWithCustomError(
      game,
      "InvalidEntryFee",
    );
  });

  it("assigns a secret and stores encrypted feedback", async function () {
    const entryFee = await game.entryFee();

    const joinTx = await game.connect(signers.alice).joinGame({ value: entryFee });
    const joinReceipt = await joinTx.wait();
    expect(joinReceipt?.status).to.eq(1);

    const hasJoined = await game.hasJoined(signers.alice.address);
    expect(hasJoined).to.eq(true);

    const storedSecretCipher = await game.getEncryptedSecret(signers.alice.address);
    expect(storedSecretCipher).to.not.eq(ethers.ZeroHash);

    await fhevm.initializeCLIApi();

    const joinBlockNumber = joinReceipt!.blockNumber!;
    const joinBlock = await ethers.provider.getBlock(joinBlockNumber);
    const previousBlock = await ethers.provider.getBlock(joinBlockNumber - 1);

    if (!joinBlock || !previousBlock) {
      throw new Error("Missing block information for secret reconstruction");
    }

    const nonceUsed = 1n; // First join increments nonce from 0 to 1
    const packedRandomness = ethers.solidityPackedKeccak256(
      ["uint256", "bytes32", "address", "uint256"],
      [joinBlock.timestamp, previousBlock.hash!, signers.alice.address, nonceUsed],
    );

    const secretValue = (BigInt(packedRandomness) % 20n) + 1n;

    const encryptedGuess = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add32(Number(secretValue))
      .encrypt();

    const guessTx = await game
      .connect(signers.alice)
      .submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    const guessReceipt = await guessTx.wait();
    expect(guessReceipt?.status).to.eq(1);

    const encryptedResult = await game.getLatestResult(signers.alice.address);
    const clearResult = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedResult,
      contractAddress,
      signers.alice,
    );

    expect(clearResult).to.eq(1n);
  });

  it("returns 2 when the guess is off by one", async function () {
    const entryFee = await game.entryFee();
    const joinTx = await game.connect(signers.alice).joinGame({ value: entryFee });
    const joinReceipt = await joinTx.wait();
    expect(joinReceipt?.status).to.eq(1);

    await fhevm.initializeCLIApi();

    const joinBlockNumber = joinReceipt!.blockNumber!;
    const joinBlock = await ethers.provider.getBlock(joinBlockNumber);
    const previousBlock = await ethers.provider.getBlock(joinBlockNumber - 1);
    if (!joinBlock || !previousBlock) {
      throw new Error("Missing block information for secret reconstruction");
    }

    const nonceUsed = 1n;
    const packedRandomness = ethers.solidityPackedKeccak256(
      ["uint256", "bytes32", "address", "uint256"],
      [joinBlock.timestamp, previousBlock.hash!, signers.alice.address, nonceUsed],
    );

    const secretValue = Number((BigInt(packedRandomness) % 20n) + 1n);
    const guessCandidate = secretValue === 20 ? secretValue - 1 : secretValue + 1;

    const encryptedGuess = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add32(guessCandidate)
      .encrypt();

    const guessTx = await game
      .connect(signers.alice)
      .submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    const guessReceipt = await guessTx.wait();
    expect(guessReceipt?.status).to.eq(1);

    const encryptedResult = await game.getLatestResult(signers.alice.address);
    const clearResult = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedResult,
      contractAddress,
      signers.alice,
    );

    expect(clearResult).to.eq(2n);
  });
});
