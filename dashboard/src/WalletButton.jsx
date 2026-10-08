import { useEffect, useRef, useState } from "react";
import { useWallet, walletChoices } from "./wallet.jsx";

function short(value) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export default function WalletButton() {
  const { address, balance, note, setNote, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onPointer(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  async function onConnect(wallet) {
    setNote("");
    try {
      await connect(wallet);
      setOpen(false);
    } catch (err) {
      setNote(err?.message || "Connection was rejected.");
    }
  }

  if (address) {
    const balanceText = balance == null ? "devnet" : `${balance.toFixed(3)} SOL`;
    return (
      <div className="flex items-center gap-3 font-mono text-xs">
        <span className="font-mono text-xs text-muted">{balanceText}</span>
        <button type="button" className="font-mono text-xs text-paper hover:text-accent" onClick={disconnect}>
          {short(address)}
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="rounded-full bg-white px-4 py-2 font-sans text-sm font-medium text-black hover:bg-[#e8e8ea]"
        onClick={() => {
          setNote("");
          setOpen((value) => !value);
        }}
      >
        CONNECT
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-white/10 bg-[#0c0c10] p-1 shadow-[0_18px_50px_rgba(0,0,0,0.45)]">
          <p className="px-3 py-2 font-mono text-[11px] text-muted">Set the wallet to Devnet.</p>
          {walletChoices().map((wallet) =>
            wallet.provider ? (
              <button
                key={wallet.id}
                type="button"
                className="block w-full px-3 py-2 text-left font-mono text-xs hover:bg-[#1a1c16]"
                onClick={() => onConnect(wallet)}
              >
                {wallet.name}
              </button>
            ) : (
              <a
                key={wallet.id}
                className="block px-3 py-2 font-mono text-xs text-muted hover:text-paper"
                href={wallet.install}
                target="_blank"
                rel="noreferrer"
              >
                {wallet.name} · install
              </a>
            )
          )}
          {note && <p className="px-3 py-2 font-mono text-[11px] text-muted">{note}</p>}
        </div>
      )}
    </div>
  );
}
