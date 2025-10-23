import '../styles/GameHeader.css';

export function GameHeader() {
  return (
    <header className="game-header">
      <div className="game-header__text">
        <h1 className="game-header__title">Encrypted Range Challenge</h1>
        <p className="game-header__subtitle">
          Pay the entry fee, receive an encrypted secret, and try to guess the number between 1 and 20.
        </p>
      </div>
    </header>
  );
}
