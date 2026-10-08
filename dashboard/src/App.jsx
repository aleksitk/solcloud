import { useState } from "react";
import Aurora from "./Aurora.jsx";
import LaunchForm from "./LaunchForm.jsx";
import NodeList from "./NodeList.jsx";
import RoundHistory from "./RoundHistory.jsx";
import RoundStatus from "./RoundStatus.jsx";
import WalletButton from "./WalletButton.jsx";

const PROGRAM_ID = "D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ";

function explorerAddress(address) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function short(value) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="4" y="6" width="5" height="20" rx="1.5" fill="#f4f1ea" />
      <rect x="13.5" y="6" width="5" height="20" rx="1.5" fill="#f4f1ea" />
      <rect x="23" y="14" width="5" height="12" rx="1.5" fill="#e07a5f" />
    </svg>
  );
}

export default function App() {
  const [view, setView] = useState("home");

  return (
    <div>
      <header className="site-header">
        <div className="shell header-row">
          <button className="brand" type="button" onClick={() => setView("home")}>
            <Mark />
            SolCloud
          </button>
          <nav className="nav">
            <button type="button" className={view === "home" ? "on" : ""} onClick={() => setView("home")}>
              Rounds
            </button>
            <button type="button" className={view === "launch" ? "on" : ""} onClick={() => setView("launch")}>
              New task
            </button>
          </nav>
          <div className="header-tools">
            <a className="program-link" href={explorerAddress(PROGRAM_ID)} target="_blank" rel="noreferrer">
              Devnet {short(PROGRAM_ID)}
            </a>
            <WalletButton />
          </div>
        </div>
      </header>

      {view === "launch" ? (
        <LaunchForm />
      ) : (
      <>
      <section className="hero">
        <Aurora />
        <div className="hero-shade" />
        <div className="shell hero-inner">
          <div className="hero-copy">
            <p className="kicker">Solana · verifiable compute</p>
            <h1>Majority is the proof.</h1>
            <p className="lede">
              Staked nodes run the same Wasm program. They commit a hash, then reveal
              the output. The chain pays the majority and slashes the rest.
            </p>
          </div>
          <aside className="monitor" aria-label="How a round is settled">
            <div className="monitor-top">
              <span className="live">
                <i />
                Devnet round
              </span>
              <span>2 of 3</span>
            </div>
            <div className="nodes">
              <div className="node agree">
                <span className="node-id">Node 1</span>
                <span className="node-out">35628</span>
                <span className="node-tag">paid</span>
              </div>
              <div className="node agree">
                <span className="node-id">Node 2</span>
                <span className="node-out">35628</span>
                <span className="node-tag">paid</span>
              </div>
              <div className="node slash">
                <span className="node-id">Node 3</span>
                <span className="node-out">1</span>
                <span className="node-tag">−0.5 SOL</span>
              </div>
            </div>
            <p className="round-foot">Commit, then reveal. The mismatch loses stake.</p>
          </aside>
        </div>
      </section>

      <section className="shell below">
        <RoundStatus />
        <RoundHistory />
        <NodeList />
      </section>
      </>
      )}
    </div>
  );
}
