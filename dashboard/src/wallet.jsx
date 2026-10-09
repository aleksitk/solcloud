import { createContext, useContext, useEffect, useRef, useState } from "react";
import { RPC } from "./requestTask.js";
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

// Phantom answers -32603 "Unexpected error" for its own internal faults, often
// right after it unlocks. A second request a moment later usually succeeds.
const WALLET_INTERNAL = -32603;

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function walletErrorText(err) {
  const code = err?.code;
  if (code === 4001) return "The request was rejected in the wallet.";
  if (code === -32002) return "A wallet request is already open. Finish it in the wallet window.";
  if (code === WALLET_INTERNAL || /unexpected error/i.test(err?.message || "")) {
    return "The wallet reported an internal error. Unlock it, set it to Devnet, and try again. If it repeats, remove this site under the wallet's Connected apps and connect again.";
  }
  return err?.message || "Connection was rejected.";
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

  // Follow an account switch inside the wallet, and a disconnect from its side.
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider?.on) return undefined;
    function onAccount(next) {
      if (!next) {
        setAddress(null);
        setBalance(null);
        return;
      }
      const key = next.toString();
      setAddress(key);
      refreshBalance(key);
    }
    function onDisconnect() {
      setAddress(null);
      setBalance(null);
    }
    provider.on("accountChanged", onAccount);
    provider.on("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountChanged", onAccount);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [address]);

  async function connect(wallet) {
    setNote("");
    let response;
    try {
      response = await wallet.provider.connect();
    } catch (err) {
      console.error("wallet connect", err);
      if (err?.code !== WALLET_INTERNAL) throw err;
      await pause(500);
      response = await wallet.provider.connect();
    }
    const key = wallet.provider.publicKey?.toString() || response?.publicKey?.toString();
    if (!key) throw new Error("The wallet did not return an address.");
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
