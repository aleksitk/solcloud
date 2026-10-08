import { useState } from "react";
import Aurora from "./Aurora.jsx";
import Field from "./Field.jsx";
import FunctionView from "./FunctionView.jsx";
import LaunchForm from "./LaunchForm.jsx";
import { MazeSummary, MazeView } from "./MazePath.jsx";
import NodeList from "./NodeList.jsx";
import RoundHistory from "./RoundHistory.jsx";
import RoundStatus from "./RoundStatus.jsx";
import StakeForm from "./StakeForm.jsx";
import WalletButton from "./WalletButton.jsx";

const PROGRAM_ID = "D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ";

const FACTS = [
  "Commit, then reveal",
  "Committee of 3, 5, 7, 9, or 11",
  "Majority is half plus one",
  "A mismatch loses stake",
  "The same Wasm on every node",
  "The reward stays in escrow",
  "Settled on Solana devnet",
];

const STEPS = [
  ["01", "Request", "The wallet locks the reward and names the committee."],
  ["02", "Commit", "Each node posts a hash. The output stays hidden."],
  ["03", "Reveal", "The output opens. The hash has to match the commit."],
  ["04", "Settle", "The majority is paid. A mismatch loses stake."],
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
      <rect x="4" y="6" width="5" height="20" rx="1.5" fill="#17151c" />
      <rect x="13.5" y="6" width="5" height="20" rx="1.5" fill="#17151c" />
      <rect x="23" y="14" width="5" height="12" rx="1.5" fill="#e07a5f" />
    </svg>
  );
}

export default function App() {
  const [view, setView] = useState("home");

  return (
    <div className="app">
      <Field />
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
            <button type="button" className={view === "functions" ? "on" : ""} onClick={() => setView("functions")}>
              Functions
            </button>
            <button type="button" className={view === "launch" ? "on" : ""} onClick={() => setView("launch")}>
              New task
            </button>
            <button type="button" className={view === "stake" ? "on" : ""} onClick={() => setView("stake")}>
              Stake
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

      <main className="page" key={view}>
      {view === "launch" ? (
        <LaunchForm onOpenFunction={() => setView("functions")} />
      ) : view === "stake" ? (
        <StakeForm />
      ) : view === "functions" ? (
        <FunctionView onUse={() => setView("launch")} />
      ) : view === "map" ? (
        <MazeView onClose={() => setView("home")} />
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

      <div className="marquee">
        <div className="marquee-track">
          {[0, 1].map((copy) => (
            <ul key={copy} aria-hidden={copy === 1}>
              {FACTS.map((fact) => (
                <li key={`${copy}-${fact}`}>{fact}</li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      <section className="shell flow">
        <p className="kicker">The round</p>
        <h2>Four moves. One majority.</h2>
        <div className="flow-steps">
          <span className="flow-glow" aria-hidden="true" />
          <ol>
            {STEPS.map(([index, title, copy]) => (
              <li key={index}>
                <span>{index}</span>
                <strong>{title}</strong>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="shell network">
        <div className="network-intro">
          <p className="kicker">Network</p>
          <h2>Live on devnet.</h2>
          <p>The open round, the settled history, and the nodes that can be called.</p>
        </div>
        <div className="network-grid">
          <div className="panel">
            <RoundStatus />
            <MazeSummary onOpen={() => setView("map")} />
            <RoundHistory />
          </div>
          <div className="panel">
            <NodeList />
          </div>
        </div>
      </section>

      <section className="shell close">
        <div>
          <p className="kicker">Start</p>
          <h2>Escrow a round, or stake a node.</h2>
        </div>
        <div className="close-actions">
          <button type="button" className="submit" onClick={() => setView("launch")}>
            New task
          </button>
          <button type="button" className="close-ghost" onClick={() => setView("stake")}>
            Stake
          </button>
        </div>
      </section>
      </>
      )}
      </main>
    </div>
  );
}
