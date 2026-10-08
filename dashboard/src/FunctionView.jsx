import { useState } from "react";
import { WASM_HASH } from "./requestTask.js";

export default function FunctionView({ onUse }) {
  const [copied, setCopied] = useState(false);

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(WASM_HASH);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="shell launch">
      <p className="kicker">Functions</p>
      <h1>The program nodes run.</h1>
      <p className="lede">
        A task names a Wasm program by its SHA-256. Nodes check the file against that hash, then run it.
        This demo has one program.
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
          <button type="button" className="submit fn-use" onClick={onUse}>
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
    </section>
  );
}
