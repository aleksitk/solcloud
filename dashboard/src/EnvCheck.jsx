import { useState } from "react";

const KEY = "solcloud.envCheck";

function readStored() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "pass" || raw === "fail") return { result: raw, at: null };
    const parsed = JSON.parse(raw);
    if (parsed?.result === "pass" || parsed?.result === "fail") return parsed;
  } catch {
    // This browser is not storing the one local result.
  }
  return { result: null, at: null };
}

function remember(result, at) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ result, at }));
  } catch {
    // The result still shows for this visit.
  }
}

function clock(at) {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export default function EnvCheck() {
  const stored = readStored();
  const [result, setResult] = useState(stored.result);
  const [checkedAt, setCheckedAt] = useState(stored.at);
  const [detail, setDetail] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    if (running) return;
    setRunning(true);
    setDetail("");
    try {
      const response = await fetch("/api/check", { method: "POST" });
      if (!response.ok) throw new Error("missing");
      const body = await response.json();
      const next = body.ok ? "pass" : "fail";
      const at = Date.now();
      remember(next, at);
      setResult(next);
      setCheckedAt(at);
      setDetail(body.ok ? "" : body.detail || "The check failed.");
    } catch {
      setDetail("From the worker folder, run node check.mjs.");
    } finally {
      setRunning(false);
    }
  }

  const label = running ? "Checking" : result === "pass" ? "Pass" : result === "fail" ? "Fail" : "Not run";
  const tone = running ? "" : result === "pass" ? "good" : result === "fail" ? "bad" : "";

  return (
    <div className="card">
      <div className="card-head">
        <h3>Machine check</h3>
        <span className="state">
          <i className={`dot ${tone}`} />
          {label}
        </span>
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Runs the worker self-test on this machine: the maze result, a wrong-hash refusal, and the timeout. It works
        when the site is served from the repository with <span className="mono">npm run dev</span>.
      </p>
      <div className="row-actions" style={{ marginTop: 16 }}>
        <button className="btn ghost small" type="button" onClick={run} disabled={running}>
          {running ? "Checking…" : result ? "Check again" : "Check this machine"}
        </button>
      </div>
      {!running && checkedAt ? (
        <p className="hint">{result === "fail" ? "Failed" : "Passed"} at {clock(checkedAt)}.</p>
      ) : null}
      {detail ? <p className="form-error">{detail}</p> : null}
    </div>
  );
}
