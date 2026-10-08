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
        <span className="font-mono text-xs text-[#5f5a66]">{balanceText}</span>
        <button type="button" className="font-mono text-xs text-[#17151c] hover:text-[#0b7a4b]" onClick={disconnect}>
          {short(address)}
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="rounded-full bg-[#17151c] px-4 py-2 font-sans text-sm font-medium text-white hover:bg-[#2a2630]"
        onClick={() => {
          setNote("");
          setOpen((value) => !value);
        }}
      >
        CONNECT
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-black/10 bg-white p-1 text-[#17151c] shadow-[0_18px_40px_rgba(23,21,28,0.12)]">
          <p className="px-3 py-2 font-mono text-[11px] text-[#5f5a66]">Set the wallet to Devnet.</p>
          {walletChoices().map((wallet) =>
            wallet.provider ? (
              <button
                key={wallet.id}
                type="button"
                className="block w-full rounded-xl px-3 py-2 text-left font-mono text-xs text-[#17151c] hover:bg-[#f3f0ea]"
                onClick={() => onConnect(wallet)}
              >
                {wallet.name}
              </button>
            ) : (
              <a
                key={wallet.id}
                className="block px-3 py-2 font-mono text-xs text-[#5f5a66] hover:text-[#17151c]"
                href={wallet.install}
                target="_blank"
                rel="noreferrer"
              >
                {wallet.name} · install
              </a>
            )
          )}
          {note && <p className="px-3 py-2 font-mono text-[11px] text-[#5f5a66]">{note}</p>}
        </div>
      )}
    </div>
  );
}
