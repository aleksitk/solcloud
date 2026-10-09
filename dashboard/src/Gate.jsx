import WalletButton from "./WalletButton.jsx";

// Shown in place of a page that only makes sense with a wallet connected.
export default function Gate({ title, copy }) {
  return (
    <div className="gate">
      <span className="gate-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <rect x="3" y="6" width="18" height="13" rx="3" />
          <path d="M16 12.5h2" strokeLinecap="round" />
          <path d="M3 10h18" />
        </svg>
      </span>
      <h2>{title}</h2>
      <p>{copy}</p>
      <WalletButton label="Connect wallet" center />
      <small>Phantom or Solflare, set to Devnet.</small>
    </div>
  );
}
