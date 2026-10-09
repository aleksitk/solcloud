import { useState } from "react";
import { useFunctionChoice } from "./functionChoice.jsx";

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// The editor a requester writes their program in.
export default function CodeEditor() {
  const { source, setSource, compiled, setCompiled } = useFunctionChoice();
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState("");

  async function compile() {
    if (compiling) return;
    setCompiling(true);
    setError("");
    try {
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source }),
      });
      // The published site is static. Only the local dev server has /api/compile.
      if (response.status === 404) {
        throw new Error("Compile runs on the local dev server. Start it with npm run dev in dashboard/.");
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Compile failed.");
      setCompiled({ name: "Your code", hash: body.hash, bytes: bytesFromBase64(body.wasmBase64) });
    } catch (err) {
      setError(err.message || "Compile failed.");
    } finally {
      setCompiling(false);
    }
  }

  return (
    <>
      <section className="fn-editor" aria-label="AssemblyScript editor">
        <header className="fn-editor-bar">
          <span className="fn-file">function.ts</span>
          <span className={compiled ? "fn-state on" : "fn-state"}>{compiled ? "Compiled" : "Not compiled"}</span>
          <button type="button" className="btn small" onClick={compile} disabled={compiling}>
            {compiling ? "Compiling…" : "Compile"}
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
              <span>Wasm SHA-256</span>
              <code>{compiled.hash}</code>
            </div>
          </footer>
        ) : null}
      </section>
      <p className="note">
        <b>This code is the program the nodes run.</b> Compile turns it into Wasm. The task stores that Wasm's
        SHA-256, and every node on the committee runs those exact bytes and refuses anything else. Use integers
        only, export <span className="mono">alloc</span> and <span className="mono">run</span>, and keep input and
        output within 64 bytes.
      </p>
      <p className="note warn">
        For now a compiled function is saved on this machine only, so only nodes running here can execute it.
      </p>
    </>
  );
}
