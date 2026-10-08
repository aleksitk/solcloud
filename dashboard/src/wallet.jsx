import { createContext, useContext, useRef, useState } from "react";

const RPC = "https://api.devnet.solana.com";
const WalletContext = createContext(null);

export function walletChoices() {
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

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [balance, setBalance] = useState(null);
  const [note, setNote] = useState("");
  const providerRef = useRef(null);

  async function refreshBalance(next = address) {
    if (!next) return;
    setBalance(null);
    try {
      setBalance(await devnetBalance(next));
    } catch {
      setNote("Devnet balance is unavailable.");
    }
  }

  async function connect(wallet) {
    setNote("");
    const response = await wallet.provider.connect();
    const key = wallet.provider.publicKey?.toString() || response.publicKey.toString();
    providerRef.current = wallet.provider;
    setAddress(key);
    refreshBalance(key);
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

  async function signTransaction(tx) {
    const provider = providerRef.current;
    if (!provider?.signTransaction) {
      throw new Error("Connect a Devnet wallet first.");
    }
    const signed = await provider.signTransaction(tx);
    return signed || tx;
  }

  return (
    <WalletContext.Provider
      value={{ address, balance, note, setNote, connect, disconnect, signTransaction, refreshBalance }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("WalletProvider is missing.");
  return value;
}
