import { useEffect, useRef, useState } from "react";

const RPC = "https://api.devnet.solana.com";

function walletChoices() {
  const phantom = window.phantom?.solana;
  const solflare = window.solflare;
  return [
    {
      id: "phantom",
      name: "Phantom",
      provider: phantom?.isPhantom ? phantom : null,
      install: "https://phantom.com/download",
    },
    {
      id: "solflare",
      name: "Solflare",
      provider: solflare?.isSolflare ? solflare : null,
      install: "https://solflare.com/download",
    },
  ];
}

function short(value) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

async function devnetBalance(address) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [address],
        }),
      });
      const body = await response.json();
      if (body.error) throw new Error(body.error.message);
      return body.result.value / 1_000_000_000;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export default function WalletButton() {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [note, setNote] = useState("");
  const providerRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    function onPointer(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  async function loadBalance(next) {
    setBalance(null);
    try {
      setBalance(await devnetBalance(next));
    } catch {
      setNote("Devnet balance is unavailable.");
    }
  }

  async function connect(wallet) {
    setNote("");
    try {
      const response = await wallet.provider.connect();
      const key = wallet.provider.publicKey?.toString() || response.publicKey.toString();
      providerRef.current = wallet.provider;
      setAddress(key);
      setOpen(false);
      loadBalance(key);
    } catch (err) {
      setNote(err?.message || "Connection was rejected.");
    }
  }

  async function disconnect() {
    try {
      await providerRef.current?.disconnect();
    } catch {
      // The wallet may already be closed.
    }
    providerRef.current = null;
    setAddress(null);
    setBalance(null);
    setNote("");
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
                onClick={() => connect(wallet)}
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
