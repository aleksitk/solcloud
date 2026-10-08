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
    <div className="env-check">
      <div className="ledger-head">
        <h2>Environment</h2>
        <span className="status">
          <b>
            <i className={tone} />
            {label}
          </b>
        </span>
      </div>
      <p className="hint">
        Run <span className="mono">node check.mjs</span> in the worker folder on this machine before it takes work. The node list does not use the result.
      </p>
      <button className="submit" type="button" onClick={run} disabled={running}>
        {running ? "Checking…" : result ? "Check again" : "Check this machine"}
      </button>
      {running ? <p className="checked">Running the check on this machine…</p> : null}
      {!running && checkedAt ? (
        <p className="checked">{result === "fail" ? "Failed" : "Passed"} at {clock(checkedAt)}.</p>
      ) : null}
      {detail ? <p className="form-error">{detail}</p> : null}
    </div>
  );
}
