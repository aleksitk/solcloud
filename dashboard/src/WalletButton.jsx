import { useEffect, useRef, useState } from "react";
import { useWallet, walletChoices, walletErrorText } from "./wallet.jsx";

function short(value) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export default function WalletButton({ label = "Connect", center = false }) {
  const { address, balance, note, setNote, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onPointer(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  async function onConnect(wallet) {
    setNote("");
    // A wallet whose extension has stopped never answers and opens no window.
    // Say so instead of leaving the menu silent.
    const silent = setTimeout(() => {
      setNote(
        `${wallet.name} has not answered. If no window opened, turn the extension off and on in chrome://extensions, then reload this tab.`
      );
    }, 8000);
    try {
      await connect(wallet);
      setOpen(false);
    } catch (err) {
      console.error("wallet connect", err);
      setNote(walletErrorText(err));
    } finally {
      clearTimeout(silent);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  const menuClass = center ? "wallet-menu center" : "wallet-menu";

  if (address) {
    return (
      <div className="wallet" ref={rootRef}>
        <button type="button" className="wallet-chip" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <i className="dot good" />
          {short(address)}
          <em>{balance == null ? "devnet" : `${balance.toFixed(2)} SOL`}</em>
        </button>
        {open && (
          <div className={menuClass}>
            <button type="button" onClick={copy}>
              {copied ? "Copied" : "Copy address"}
            </button>
            <a href={`https://explorer.solana.com/address/${address}?cluster=devnet`} target="_blank" rel="noreferrer">
              View on Explorer <small>↗</small>
            </a>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                disconnect();
              }}
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="wallet" ref={rootRef}>
      <button
        type="button"
        className={center ? "btn" : "btn small"}
        aria-expanded={open}
        onClick={() => {
          setNote("");
          setOpen((value) => !value);
        }}
      >
        {label}
      </button>
      {open && (
        <div className={menuClass}>
          <p>Set the wallet to Devnet.</p>
          {walletChoices().map((wallet) =>
            wallet.provider ? (
              <button key={wallet.id} type="button" onClick={() => onConnect(wallet)}>
                {wallet.name} <small>Detected</small>
              </button>
            ) : (
              <a key={wallet.id} href={wallet.install} target="_blank" rel="noreferrer">
                {wallet.name} <small>Install ↗</small>
              </a>
            )
          )}
          {note && <p className="warn">{note}</p>}
        </div>
      )}
    </div>
  );
}
