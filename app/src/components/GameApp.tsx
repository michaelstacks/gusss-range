import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, usePublicClient } from 'wagmi';
import { Contract } from 'ethers';
import { formatEther } from 'viem';

import { GameHeader } from './GameHeader';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/GameApp.css';

const ZERO_CIPHERTEXT = '0x0000000000000000000000000000000000000000000000000000000000000000';

function interpretResult(value: number) {
  switch (value) {
    case 1:
      return 'Perfect guess! You matched the secret exactly.';
    case 2:
      return 'Almost there. Your guess was off by one.';
    case 3:
      return 'Close attempt. You were off by two.';
    case 4:
      return 'The guess missed the mark. Try again!';
    default:
      return null;
  }
}

export function GameApp() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { instance, isLoading: isZamaLoading, error: zamaError } = useZamaInstance();
  const signer = useEthersSigner();
  const contractAddress = CONTRACT_ADDRESS;
  const isContractConfigured = Boolean(contractAddress && contractAddress.length > 0);

  const [entryFee, setEntryFee] = useState<bigint>(0n);
  const [hasJoined, setHasJoined] = useState(false);
  const [round, setRound] = useState<number>(0);
  const [guessValue, setGuessValue] = useState('');
  const [encryptedResult, setEncryptedResult] = useState<string | null>(null);
  const [lastDecryptedCipher, setLastDecryptedCipher] = useState<string | null>(null);
  const [feedbackCode, setFeedbackCode] = useState<number | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isGuessing, setIsGuessing] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const formattedEntryFee = useMemo(() => (entryFee ? `${formatEther(entryFee)} ETH` : '---'), [entryFee]);
  const feedbackMessage = useMemo(() => (feedbackCode !== null ? interpretResult(feedbackCode) : null), [feedbackCode]);

  useEffect(() => {
    if (!publicClient || !isContractConfigured) {
      return;
    }

    let cancelled = false;
    const loadEntryFee = async () => {
      try {
        const value = (await publicClient.readContract({
          address: contractAddress,
          abi: CONTRACT_ABI,
          functionName: 'entryFee',
        })) as bigint;

        if (!cancelled) {
          setEntryFee(value);
        }
      } catch (err) {
        console.error('Failed to load entry fee', err);
      }
    };

    loadEntryFee();

    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  const refreshPlayerData = useCallback(async () => {
    if (!publicClient || !address || !isContractConfigured) {
      setHasJoined(false);
      setRound(0);
      setEncryptedResult(null);
      setFeedbackCode(null);
      setLastDecryptedCipher(null);
      return;
    }

    try {
      const [joined, activeRound, latestResult] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: CONTRACT_ABI,
          functionName: 'hasJoined',
          args: [address],
        }) as Promise<boolean>,
        publicClient.readContract({
          address: contractAddress,
          abi: CONTRACT_ABI,
          functionName: 'getRound',
          args: [address],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: contractAddress,
          abi: CONTRACT_ABI,
          functionName: 'getLatestResult',
          args: [address],
        }) as Promise<string>,
      ]);

      setHasJoined(joined);
      setRound(Number(activeRound));
      setEncryptedResult((previous) => {
        if (previous !== latestResult) {
          setFeedbackCode(null);
          setLastDecryptedCipher(null);
          if (latestResult && latestResult !== ZERO_CIPHERTEXT) {
            setStatusMessage('Encrypted result ready. Click decrypt to reveal feedback.');
          }
        }
        return latestResult;
      });

      if (!joined) {
        setFeedbackCode(null);
        setLastDecryptedCipher(null);
      }
    } catch (err) {
      console.error('Failed to refresh player data', err);
    }
  }, [address, publicClient, isContractConfigured, contractAddress]);

  useEffect(() => {
    refreshPlayerData();
  }, [refreshPlayerData]);

  const decryptCiphertext = useCallback(
    async (cipher: string) => {
      if (!instance || !address || !isContractConfigured) {
        return;
      }

      if (isDecrypting) {
        return;
      }

      setIsDecrypting(true);
      setStatusMessage('Requesting decryption...');

      try {
        const keypair = instance.generateKeypair();
        const contractAddresses = [contractAddress];
        const startTimestamp = Math.floor(Date.now() / 1000).toString();
        const durationDays = '10';

        const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimestamp, durationDays);
        const resolvedSigner = await signer;
        if (!resolvedSigner) {
          throw new Error('Wallet signer is not available');
        }

        const signature = await resolvedSigner.signTypedData(
          eip712.domain,
          { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
          eip712.message,
        );

        const response = await instance.userDecrypt(
          [{ handle: cipher, contractAddress }],
          keypair.privateKey,
          keypair.publicKey,
          signature.replace('0x', ''),
          contractAddresses,
          address,
          startTimestamp,
          durationDays,
        );

        const values = Object.values(response ?? {});
        const rawValue = (response && (response as Record<string, string>)[cipher]) || values[0];

        if (!rawValue) {
          throw new Error('No decrypted value returned');
        }

        const numeric = Number(rawValue);
        if (!Number.isInteger(numeric)) {
          throw new Error('Unexpected decrypted format');
        }

        setFeedbackCode(numeric);
        setLastDecryptedCipher(cipher);
        setStatusMessage('Decryption completed.');
      } catch (err) {
        console.error('Failed to decrypt result', err);
        setStatusMessage(err instanceof Error ? err.message : 'Unable to decrypt result');
      } finally {
        setIsDecrypting(false);
      }
    },
    [address, instance, isContractConfigured, isDecrypting, signer],
  );

  useEffect(() => {
    if (!encryptedResult || encryptedResult === ZERO_CIPHERTEXT) {
      return;
    }

    if (!address || !isContractConfigured) {
      return;
    }

    if (encryptedResult !== lastDecryptedCipher) {
      setStatusMessage('Encrypted result ready. Click decrypt to reveal feedback.');
    }
  }, [address, encryptedResult, isContractConfigured, lastDecryptedCipher]);

  const handleJoin = async () => {
    if (!address) {
      setStatusMessage('Connect your wallet to join.');
      return;
    }

    if (!isContractConfigured) {
      setStatusMessage('Contract address is not configured.');
      return;
    }

    setIsJoining(true);
    setStatusMessage('Submitting join transaction...');

    try {
      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Wallet signer is not available');
      }

      const contract = new Contract(contractAddress, CONTRACT_ABI, resolvedSigner);
      const fee = entryFee || ((await contract.entryFee()) as bigint);

      const tx = await contract.joinGame({ value: fee });
      await tx.wait();

      setStatusMessage('Joined the game. A new encrypted secret has been generated.');
      setFeedbackCode(null);
      setLastDecryptedCipher(null);
      await refreshPlayerData();
    } catch (err) {
      console.error('Join transaction failed', err);
      setStatusMessage(err instanceof Error ? err.message : 'Failed to join the game');
    } finally {
      setIsJoining(false);
    }
  };

  const handleGuess = async () => {
    if (!address) {
      setStatusMessage('Connect your wallet to submit guesses.');
      return;
    }

    if (!isContractConfigured) {
      setStatusMessage('Contract address is not configured.');
      return;
    }

    if (!hasJoined) {
      setStatusMessage('Join the game before submitting a guess.');
      return;
    }

    const guessNumber = Number(guessValue.trim());
    if (!Number.isInteger(guessNumber) || guessNumber < 1 || guessNumber > 20) {
      setStatusMessage('Enter a number between 1 and 20.');
      return;
    }

    if (!instance) {
      setStatusMessage('Encryption service is not ready yet.');
      return;
    }

    setIsGuessing(true);
    setStatusMessage('Encrypting guess and submitting transaction...');

    try {
      const resolvedSigner = await signer;
      if (!resolvedSigner) {
        throw new Error('Wallet signer is not available');
      }

      const encryptedInput = await instance
        .createEncryptedInput(contractAddress, address)
        .add32(guessNumber)
        .encrypt();

      const contract = new Contract(contractAddress, CONTRACT_ABI, resolvedSigner);

      const tx = await contract.submitGuess(encryptedInput.handles[0], encryptedInput.inputProof);
      await tx.wait();

      setStatusMessage('Guess submitted. Click decrypt after the result updates.');
      setGuessValue('');
      await refreshPlayerData();
    } catch (err) {
      console.error('Guess transaction failed', err);
      setStatusMessage(err instanceof Error ? err.message : 'Failed to submit guess');
    } finally {
      setIsGuessing(false);
    }
  };

  const manualDecrypt = async () => {
    if (!encryptedResult || encryptedResult === ZERO_CIPHERTEXT) {
      setStatusMessage('No encrypted result to decrypt yet.');
      return;
    }

    if (!isContractConfigured) {
      setStatusMessage('Contract address is not configured.');
      return;
    }

    await decryptCiphertext(encryptedResult);
  };

  return (
    <div className="game-app">
      <div className="game-app__hero">
        <GameHeader />
        <ConnectButton />
      </div>

      <div className="game-app__grid">
        <section className="game-card">
          <h2 className="game-card__title">Join the Game</h2>
          <p className="game-card__description">
            Entry fee: <span className="highlight">{formattedEntryFee}</span>
          </p>
          <button
            type="button"
            onClick={handleJoin}
            className="primary-button"
            disabled={isJoining || !address || isZamaLoading || !isContractConfigured}
          >
            {isJoining ? 'Joining...' : hasJoined ? 'Rejoin & Refresh Secret' : 'Join with 0.001 ETH'}
          </button>

          <div className="game-card__status">
            <p>Current round: <strong>{round}</strong></p>
            <p>
              Contract:
              <strong>
                {isContractConfigured ? ` ${contractAddress}` : ' Set VITE_GAME_CONTRACT_ADDRESS'}
              </strong>
            </p>
            <p>Encryption service: <strong>{isZamaLoading ? 'Loading...' : zamaError ? 'Unavailable' : 'Ready'}</strong></p>
          </div>

          {zamaError ? <p className="error-text">{zamaError}</p> : null}
        </section>

        <section className="game-card">
          <h2 className="game-card__title">Submit a Guess</h2>
          <p className="game-card__description">
            Enter a number between 1 and 20. Your guess will be encrypted locally before reaching the contract.
          </p>

          <div className="guess-input">
            <input
              type="number"
              min={1}
              max={20}
              value={guessValue}
              onChange={(event) => setGuessValue(event.target.value)}
              placeholder="Your guess"
              className="guess-input__field"
            />
            <button
              type="button"
              onClick={handleGuess}
              className="primary-button"
              disabled={isGuessing || !address || !hasJoined || isZamaLoading || !isContractConfigured}
            >
              {isGuessing ? 'Submitting...' : 'Submit Guess'}
            </button>
          </div>

          <div className="result-card">
            <h3 className="result-card__title">Latest Result</h3>
            <p className="result-card__cipher">
              {encryptedResult && encryptedResult !== ZERO_CIPHERTEXT ? encryptedResult : 'No guess submitted yet.'}
            </p>

            <button
              type="button"
              onClick={manualDecrypt}
              className="secondary-button"
              disabled={
                isDecrypting ||
                !encryptedResult ||
                encryptedResult === ZERO_CIPHERTEXT ||
                !address ||
                !isContractConfigured
              }
            >
              {isDecrypting ? 'Decrypting...' : 'Decrypt Latest Result'}
            </button>

            {feedbackMessage ? (
              <div className="result-card__feedback">
                <span className="feedback-code">Code {feedbackCode}</span>
                <p className="feedback-message">{feedbackMessage}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {statusMessage ? <div className="status-banner">{statusMessage}</div> : null}
    </div>
  );
}
