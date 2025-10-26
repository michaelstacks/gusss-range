# Encrypted Gusss Range

An on-chain guessing game that keeps player secrets private with fully homomorphic encryption (FHE). Players contribute
0.001 ether to start a round, receive a Zama-encrypted secret number between 1 and 20, and submit encrypted guesses.
Thanks to FHE, the contract evaluates every guess without ever seeing raw values, while players decrypt their own
results on the front end.

---

## Introduction

The Encrypted Range Challenge demonstrates how modern Ethereum contracts can provide interactive gameplay without
leaking player data. The project combines a Solidity contract that understands Zama ciphertexts with a React/Vite front
end that performs client-side encryption, communicates through RainbowKit, and guides players through key-management and
decryption flows. The result is a production-ready reference for privacy-preserving games, lotteries, and verifiable
FHE-powered workflows.

---

## Key Advantages

- **On-chain privacy** – Secret numbers and feedback codes stay encrypted end to end; only players with the matching
  keys can decode them.
- **Deterministic fairness** – The secret number is generated on-chain with entropy derived from block data, preventing
  tampering by relayers or front-end code.
- **Seamless UX** – The React interface handles wallet connection, encryption, and decryption so players focus on the
  game instead of cryptography.
- **Sepolia-ready deployment** – Scripts and configuration for the Sepolia testnet are included, using the provided
  private key and Infura API key.
- **Auditable architecture** – Extensive TypeScript tests, tasks, and deployment scripts document the full flow from
  development to production.

---

## Problems Solved

- **Secure number guessing** – Traditional blockchain games reveal either the secret or the guesses. Here, both remain
  encrypted.
- **Player-owned data privacy** – Feedback codes (perfect match, off by one, etc.) are ciphertexts and only players can
  decrypt them.
- **Repeatable compliance** – No off-chain KYC processes or mock data are required; every interaction runs against the
  same public contract.
- **FHE integration complexity** – The repository shows how to wire the Zama relayer SDK, typed inputs, and encrypted
  contract values in a coherent developer workflow.

---

## Feature Highlights

- On-chain random secret per round with an exact 1–20 range.
- Deterministic grading that returns four encrypted codes (exact, ±1, ±2, miss).
- Self-service replays: players can rejoin with another 0.001 ETH to reset their secret.
- Automatic decryption of the latest result through the Zama relayer SDK, plus manual fallback.
- Sepolia deployment artifact syncing to front-end configuration so the UI always points to the live ABI.
- Comprehensive Hardhat setup with linting, coverage, gas reporting, and TypeChain generation.

---

## Architecture Overview

### Smart Contract Layer

- `contracts/EncryptedGuessingGame.sol` extends `SepoliaConfig` from `@fhevm/solidity`, enabling FHE operations.
- Stores each player’s encrypted secret and the last encrypted feedback code.
- Uses FHE comparison and subtraction primitives to evaluate guesses while data stays encrypted.
- Emits events for joins, evaluations, and withdrawals, giving indexers clear hooks for analytics.
- Restricts withdrawals to the deploying owner and stores per-player round counters for telemetry.

### Front-end Experience

- Located in `app/` and built with React, Vite, TypeScript, RainbowKit, Wagmi, ethers (writes), and viem (reads).
- Uses `@zama-fhe/relayer-sdk` to encrypt guesses before they reach the chain and to decrypt results via signed
  requests.
- Avoids local storage and localhost network endpoints; the experience targets Sepolia and expects deployed contracts.
- Styled with handcrafted CSS (no Tailwind) and responsive layouts to highlight the game and feedback cards.

### Zama Relayer & FHE Services

- Follows the workflows described in `docs/zama_llm.md` and `docs/zama_doc_relayer.md`.
- Generates short-lived keypairs per session, signs EIP-712 payloads, and exchanges ciphertext through the relayer.
- Handles decrypted values purely in-memory so sensitive data never persists on disk or in browser storage.

---

## Game Flow

1. **Connect a wallet** – RainbowKit and Wagmi provide a curated list of Sepolia-capable wallets.
2. **Join the game** – The player pays the 0.001 ETH entry fee through `joinGame`. The contract returns an FHE-encrypted
   secret number and stores it in player state.
3. **Encrypt guesses** – The front end uses the Zama SDK to encrypt the chosen number (1–20) and submits it via
   `submitGuess`.
4. **On-chain evaluation** – The contract compares secret and guess homomorphically and stores the encrypted result.
5. **Decrypt feedback** – The UI fetches `getLatestResult`, requests decryption from the relayer, and shows human-friendly
   feedback (“Perfect guess”, “Almost there”, etc.).
6. **Repeat or withdraw** – Players can replay unlimited rounds by paying the entry fee again; the owner can withdraw
   collected fees via `withdraw`.

---

## Tech Stack

- **Blockchain** – Solidity 0.8.27, Hardhat, hardhat-deploy, TypeChain, ethers v6.
- **FHE** – `@fhevm/solidity` primitives, Sepolia configuration, `@zama-fhe/relayer-sdk`.
- **Front end** – React 19, Vite 7, TypeScript, RainbowKit, Wagmi, viem, ethers (signing and writes).
- **Testing & Quality** – Mocha/Chai, `hardhat-gas-reporter`, ESLint, Prettier, `solidity-coverage`.
- **Tooling** – Node.js ≥ 20, npm ≥ 7, Infura for Sepolia RPC.

---

## Repository Layout

```
.
├── contracts/                  # Solidity sources (EncryptedGuessingGame.sol)
├── deploy/                     # Deployment scripts orchestrated by hardhat-deploy
├── deployments/                # Network-specific artifacts (Sepolia ABI & addresses)
├── docs/                       # Integration notes for Zama FHE and relayer usage
├── tasks/                      # Hardhat task definitions (accounts, contract helpers)
├── test/                       # TypeScript-based contract tests
├── app/                        # React + Vite front end for gameplay
├── hardhat.config.ts           # Hardhat + FHE configuration with dotenv loading
└── AGENTS.md                   # Project-specific contribution and tooling rules
```

---

## Getting Started

### 1. Install prerequisites

- Node.js 20 or higher
- npm 7 or higher
- A funded Sepolia account (for real network deployment and gameplay)
- An Infura project ID to reach Sepolia RPC endpoints

### 2. Set up root dependencies

```bash
npm install
```

### 3. Configure environment variables

Create or update the root `.env` file with the following keys:

```
INFURA_API_KEY=<your_infura_project_id>
PRIVATE_KEY=<hex_private_key_without_0x>
ETHERSCAN_API_KEY=<optional_for_verification>
MNEMONIC=<optional_for_local_testing_only>
```

- The Sepolia deployment uses `PRIVATE_KEY` (mnemonics are ignored for production).
- Ensure the Infura key is present; the Hardhat config reads `process.env.INFURA_API_KEY` for the RPC URL.

### 4. Compile, lint, and test the contracts

```bash
npm run compile
npm run test
npm run lint
```

- `npm run coverage` produces Solidity coverage reports in `coverage/`.
- `npm run gas` (via `gasReporter`) is available by setting `REPORT_GAS=1`.

### 5. Run a local Hardhat node (optional for debugging)

```bash
npm run chain      # starts hardhat node with FHE support
npm run deploy:localhost
```

> The production front end targets Sepolia; local nodes are intended for manual contract testing with Hardhat scripts.

### 6. Deploy to Sepolia

```bash
npm run deploy:sepolia
```

- Uses the account derived from `PRIVATE_KEY`.
- Generated artifacts land in `deployments/sepolia/EncryptedGuessingGame.json`.
- After deployment, optionally verify the contract:

```bash
npm run verify:sepolia -- <deployed_address>
```

### 7. Sync ABI to the front end

- Copy the ABI from `deployments/sepolia/EncryptedGuessingGame.json` into `app/src/config/contracts.ts`.
- Update the exported address in the same file to the latest Sepolia deployment.
- The front end intentionally avoids bundling JSON files and reads the ABI from the TypeScript module.

### 8. Install and run the front end

```bash
cd app
npm install
npm run dev -- --host
```

- Set `VITE_GAME_CONTRACT_ADDRESS` and `VITE_WALLETCONNECT_PROJECT_ID` before starting if you need runtime overrides.
- The front end expects a Sepolia RPC; ensure the connected wallet is also on Sepolia.

---

## Testing & Quality Gates

- **Contract unit tests** – Located in `test/`, covering join flow, guess evaluation, and withdrawal safety.
- **Static analysis** – Run `npm run lint:sol` for Solhint and `npm run lint:ts` for TypeScript linting.
- **Formatting** – `npm run prettier:check` guards Markdown, Solidity, and TypeScript formatting.
- **Coverage** – `npm run coverage` runs instrumentation with `solidity-coverage` and TypeChain regeneration.

---

## Operational Notes

- Entry fee is fixed at `1e15` wei (0.001 ETH) and enforced by the contract.
- View functions avoid using `msg.sender`, allowing trustless reads through viem on the front end.
- The contract exposes `withdraw` only to the owner; the front end does not surface owner-specific controls.
- No local storage, Tailwind, or localhost RPC calls are used in the React codebase, complying with project rules.
- Deployment scripts import `dotenv` and leverage `process.env.INFURA_API_KEY`, as required by deployment guidelines.

---

## Future Plans

- **Leaderboards & analytics** – Aggregate decrypted results off-chain to surface player streaks and accuracy metrics.
- **Multi-secret tournaments** – Allow players to run multi-round sessions with escalating rewards while keeping scores
  encrypted.
- **Mobile-focused UI** – Extend styling to deliver a native-like mobile experience with WalletConnect deep links.
- **Additional FHE games** – Reuse the encryption framework for higher/lower, battleship, or cooperative puzzle modes.
- **Relayer redundancy** – Integrate multiple relayer endpoints and automatic failover for global reliability.
- **On-chain reward distribution** – Issue ERC-20 rewards based on decrypted results while keeping guess data private.

---

## License

This repository is released under the BSD-3-Clause-Clear License. Refer to [LICENSE](LICENSE) for full terms.

---

## Additional Resources

- Zama FHE documentation (see `docs/zama_llm.md`)
- Relayer integration guide (see `docs/zama_doc_relayer.md`)
- RainbowKit onboarding: <https://www.rainbowkit.com/docs/introduction>
- Wagmi documentation: <https://wagmi.sh>

---

Made with privacy-first design principles and a passion for verifiable on-chain games.
