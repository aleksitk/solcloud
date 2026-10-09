import { useState } from "react";
import { WASM_HASH } from "./requestTask.js";
import { STARTER } from "./starter.js";
import { useFunctionChoice } from "./functionChoice.jsx";

function bytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export default function FunctionView({ onUse }) {
  const { compiled, chooseLabyrinth, chooseCompiled } = useFunctionChoice();
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState(STARTER);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState("");

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(WASM_HASH);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

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
      chooseCompiled({
        name: "Your function",
        hash: body.hash,
        bytes: bytesFromBase64(body.wasmBase64),
      });
    } catch (err) {
      setError(err.message || "Compile failed.");
    } finally {
      setCompiling(false);
    }
  }

  return (
    <section className="shell launch fn-page">
      <p className="kicker">Functions</p>
      <h1>Write the program.</h1>
      <p className="lede">Integers only. Export alloc and run. The hash is what the next task stores.</p>

      <div className="fn-workspace">
        <section className="fn-editor" aria-label="AssemblyScript editor">
          <header className="fn-editor-bar">
            <span className="fn-file">function.ts</span>
            <span className={compiled ? "fn-state on" : "fn-state"}>{compiled ? "Compiled" : "Draft"}</span>
            <button type="button" className="submit fn-use" onClick={compile} disabled={compiling}>
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
                <span>Wasm hash</span>
                <code>{compiled.hash}</code>
                <span className="fn-saved">Saved for the nodes on this machine.</span>
              </div>
              <button type="button" className="path-open" onClick={onUse}>
                Use for a new task
              </button>
            </footer>
          ) : null}
        </section>

        <aside className="fn-card fn-side">
          <header className="fn-head">
            <h2>Labyrinth</h2>
            <span>Built in</span>
          </header>
          <p>Already registered. Seed and size in, path length and hash out.</p>
          <label className="hash-field">
            Wasm hash
            <textarea
              readOnly
              rows={3}
              value={WASM_HASH}
              spellCheck={false}
              onFocus={(event) => event.target.select()}
            />
          </label>
          <div className="fn-actions">
            <button type="button" className="path-open" onClick={copyHash}>
              {copied ? "Copied" : "Copy hash"}
            </button>
            <button
              type="button"
              className="submit fn-use"
              onClick={() => {
                chooseLabyrinth();
                onUse();
              }}
            >
              Use for a new task
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
