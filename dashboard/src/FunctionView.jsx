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
    <section className="shell launch">
      <p className="kicker">Functions</p>
      <h1>The program nodes run.</h1>
      <p className="lede">
        A task names a Wasm program by its SHA-256. Nodes check the file against that hash, then run it.
        The labyrinth is built in. A second function can be compiled here.
      </p>

      <article className="fn-card">
        <header className="fn-head">
          <h2>Labyrinth</h2>
          <span>Registered</span>
        </header>
        <p>
          Shortest path through a perfect maze. Integer arithmetic only, so every node that runs this
          hash gets the same path.
        </p>
        <label className="hash-field">
          Wasm hash
          <textarea
            readOnly
            rows={1}
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
        <dl className="fn-spec">
          <div>
            <dt>Input</dt>
            <dd>Seed as u64, size as u32</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>Path length and path hash, 12 bytes</dd>
          </div>
        </dl>
      </article>

      <article className="fn-card">
        <header className="fn-head">
          <h2>Your function</h2>
          <span>{compiled ? "Compiled" : "AssemblyScript"}</span>
        </header>
        <p>Integers only. Export alloc and run. Input and output stay within 64 bytes.</p>
        <textarea
          className="fn-source"
          value={source}
          spellCheck={false}
          onChange={(event) => setSource(event.target.value)}
          aria-label="AssemblyScript source"
        />
        <div className="fn-actions">
          <button type="button" className="submit fn-use" onClick={compile} disabled={compiling}>
            {compiling ? "Compiling…" : "Compile"}
          </button>
          {compiled ? (
            <button type="button" className="path-open" onClick={onUse}>
              Use for a new task
            </button>
          ) : null}
        </div>
        {error ? <pre className="fn-error">{error}</pre> : null}
        {compiled ? (
          <label className="hash-field">
            Wasm hash
            <textarea readOnly rows={2} value={compiled.hash} spellCheck={false} onFocus={(event) => event.target.select()} />
          </label>
        ) : null}
      </article>
    </section>
  );
}
