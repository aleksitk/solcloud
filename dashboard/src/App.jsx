import { useState } from "react";
import Aurora from "./Aurora.jsx";
import LaunchForm from "./LaunchForm.jsx";
import NodeList from "./NodeList.jsx";
import RoundStatus from "./RoundStatus.jsx";
import WalletButton from "./WalletButton.jsx";

const PROGRAM_ID = "D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ";

const proofs = [
  {
    id: "05",
    status: "Finalized",
    tone: "good",
    title: "Majority paid",
    agreement: "3 of 3",
    effect: "+0.0167 SOL",
    address: "75Dtq2i5ZTmLigiCT97yKWxBeJToBpf1XA69FDCDf26Z",
  },
  {
    id: "02",
    status: "Finalized",
    tone: "good",
    title: "Majority paid",
    agreement: "3 of 3",
    effect: "+0.0167 SOL",
    address: "3huCpEBJFqYaFENgiuZivtQw1oCXBzJqQCVcCtT7JEnk",
  },
  {
    id: "03",
    status: "Slashed",
    tone: "bad",
    title: "Minority lost stake",
    agreement: "2 of 3",
    effect: "−0.5000 SOL",
    address: "JhjLVcWT73qVbV6WWgRo7w1nkYiuEji52pLFmVvE6hV",
  },
  {
    id: "04",
    status: "Refunded",
    tone: "muted",
    title: "No majority",
    agreement: "1 of 3",
    effect: "+0.0500 SOL",
    address: "2DsvhJTuHe9qspSQaBb1QpxjuvQnZcL4oeVgSbcbry6k",
  },
  {
    id: "01",
    status: "Refunded",
    tone: "muted",
    title: "Window expired",
    agreement: "0 of 3",
    effect: "+0.0500 SOL",
    address: "8ZUdN4nZLqRsKgH9uV88YRX8My6RsGi1hJ1v4aYAGw2a",
  },
];

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
        <div className="ledger-head">
          <h2>Settled rounds</h2>
          <span>Devnet · {proofs.length}</span>
        </div>
        <div className="sheet">
          <div className="sheet-head">
            <span>Round</span>
            <span>Status</span>
            <span>Agreement</span>
            <span>Effect</span>
            <span />
          </div>
          {proofs.map((proof) => (
            <a key={proof.id} className="sheet-row" href={explorerAddress(proof.address)} target="_blank" rel="noreferrer">
              <span className="mono">{proof.id}</span>
              <span className="status">
                <b>
                  <i className={proof.tone} />
                  {proof.status}
                </b>
                <em>{proof.title}</em>
              </span>
              <span className="mono agree">{proof.agreement}</span>
              <span className={`mono amount ${proof.tone}`}>{proof.effect}</span>
              <span className="go">Explorer</span>
            </a>
          ))}
        </div>
        <NodeList />
      </section>
      </>
      )}
    </div>
  );
}
