import { useEffect, useRef, useState } from "react";
import { compileInBrowser } from "./compileInBrowser.js";
import { useFunctionChoice } from "./functionChoice.jsx";
import { buildModuleUpload, MAX_MODULE_BYTES, readModule, sendSigned } from "./requestTask.js";
import { useWallet } from "./wallet.jsx";

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// The editor a requester writes their program in, and the step that puts it on chain.
export default function CodeEditor() {
  const wallet = useWallet();
  const { source, setSource, compiled, setCompiled, published, setPublished } = useFunctionChoice();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  // A module this wallet stored earlier needs no second upload.
  useEffect(() => {
    if (!compiled || !wallet.address) return undefined;
    let live = true;
    readModule(wallet.address, compiled.hash)
      .then((state) => {
        if (live && state.sealed) setPublished(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [compiled, wallet.address]);

  async function compile() {
    if (busy) return;
    setBusy("compile");
    setError("");
    try {
      const { hash, bytes } = await compileInBrowser(source);
      setCompiled({ name: "Your code", hash, bytes });
    } catch (err) {
      setError(err.message || "Compile failed.");
    } finally {
      setBusy("");
    }
  }

  async function onFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_MODULE_BYTES) {
        throw new Error(`A module must be between 1 and ${MAX_MODULE_BYTES} bytes. This file is ${bytes.length}.`);
      }
      if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
        throw new Error("That file is not a WebAssembly module.");
      }
      setCompiled({ name: file.name, hash: await sha256Hex(bytes), bytes });
    } catch (err) {
      setError(err.message || "The file could not be read.");
    }
  }

  async function publish() {
    if (busy || !compiled) return;
    setBusy("publish");
    setError("");
    try {
      const upload = await buildModuleUpload({
        uploader: wallet.address,
        bytes: compiled.bytes,
        hashHex: compiled.hash,
      });
      if (upload.txs.length) {
        const signed = await wallet.signAllTransactions(upload.txs);
        // In order: each write appends to what the one before it stored.
        for (const tx of signed) await sendSigned(tx, upload.blockhash, upload.lastValidBlockHeight);
      }
      setPublished(true);
      wallet.refreshBalance();
    } catch (err) {
      setError(`${err.message || "Publishing failed."} Press Publish again to continue where it stopped.`);
    } finally {
      setBusy("");
    }
  }

  const state = published ? "On chain" : compiled ? "Compiled" : "Not compiled";

  return (
    <>
      <section className="fn-editor" aria-label="AssemblyScript editor">
        <header className="fn-editor-bar">
          <span className="fn-file">{compiled && compiled.name !== "Your code" ? compiled.name : "function.ts"}</span>
          <span className={compiled ? "fn-state on" : "fn-state"}>{state}</span>
          <input ref={fileRef} type="file" accept=".wasm,application/wasm" hidden onChange={onFile} />
          <button type="button" className="btn ghost small" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
            Upload .wasm
          </button>
          <button type="button" className="btn small" onClick={compile} disabled={Boolean(busy)}>
            {busy === "compile" ? "Compiling…" : "Compile"}
          </button>
        </header>
        <textarea
          className="fn-source"
          value={source}
          spellCheck={false}
          onChange={(event) => setSource(event.target.value)}
          aria-label="AssemblyScript source"
        />
        {error ? <pre className="fn-error">{error}</pre> : null}
        {compiled ? (
          <footer className="fn-editor-foot">
            <div>
              <span>
                Wasm SHA-256 · {compiled.bytes.length.toLocaleString("en-US")} bytes
              </span>
              <code>{compiled.hash}</code>
            </div>
            {published ? (
              <span className="fn-state on">Nodes can fetch it</span>
            ) : (
              <button type="button" className="btn small" onClick={publish} disabled={Boolean(busy)}>
                {busy === "publish" ? "Publishing…" : "Publish"}
              </button>
            )}
          </footer>
        ) : null}
      </section>
      <p className="note">
        <b>This code is the program the nodes run.</b> Compile turns it into Wasm. Publish stores that Wasm on
        Solana, where any node can fetch it. The task names it by SHA-256, so every node runs those exact bytes and
        refuses anything else.
      </p>
    </>
  );
}
