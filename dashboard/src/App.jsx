import { useEffect, useState } from "react";
import Committee from "./Committee.jsx";
import Docs from "./Docs.jsx";
import Gate from "./Gate.jsx";
import LaunchForm from "./LaunchForm.jsx";
import { MazeSummary, MazeView } from "./MazePath.jsx";
import MyRequests from "./MyRequests.jsx";
import NetworkStats from "./NetworkStats.jsx";
import NodeBrowser from "./NodeBrowser.jsx";
import NodeList from "./NodeList.jsx";
import RoundHistory from "./RoundHistory.jsx";
import RoundStatus from "./RoundStatus.jsx";
import StakeForm from "./StakeForm.jsx";
import WalletButton from "./WalletButton.jsx";
import { useWallet } from "./wallet.jsx";

const PROGRAM_ID = "D59BiW9kNVq4dnYfk8JcxHqQGwaXqHuaXCoaaFPK9GoZ";
const REPO = "https://github.com/aleksitk/solcloud";

const NAV = [
  ["home", "Overview"],
  ["compute", "Run a task"],
  ["operate", "Run a node"],
  ["network", "Network"],
  ["docs", "Docs"],
];
const VIEWS = new Set(["home", "network", "compute", "operate", "docs", "map"]);

const STEPS = [
  ["01", "Request", "A wallet locks the reward. The program draws the committee."],
  ["02", "Commit", "Each node posts a hash. The output stays hidden."],
  ["03", "Reveal", "The output opens. It has to match the commit."],
  ["04", "Settle", "The majority is paid. A mismatch loses stake."],
];

function explorerAddress(address) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

function viewFromHash() {
  const name = window.location.hash.replace(/^#\/?/, "");
  return VIEWS.has(name) ? name : "home";
}

function Mark() {
  return (
    <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#3fe0a2" />
      <circle cx="11" cy="12" r="3" fill="#07090c" />
      <circle cx="21" cy="12" r="3" fill="#07090c" />
      <circle cx="16" cy="21" r="3" fill="#07090c" fillOpacity="0.35" />
    </svg>
  );
}

function Tabs({ items, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([id, label]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          className={value === id ? "on" : ""}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Fade a section in the first time it scrolls into view.
function Reveal({ className = "", children }) {
  const [shown, setShown] = useState(false);
  const [node, setNode] = useState(null);

  useEffect(() => {
    if (!node) return undefined;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        watcher.disconnect();
      },
      { threshold: 0.12 }
    );
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [node]);

  return (
    <section ref={setNode} className={`${className} reveal${shown ? " in" : ""}`}>
      {children}
    </section>
  );
}

function Home({ go }) {
  return (
    <>
      <section className="shell hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="kicker">Verifiable compute on Solana</p>
            <h1>
              Majority is <span>the proof.</span>
            </h1>
            <p className="lede">
              Send code. Several independent nodes run it. The answer most of them agree on is the result, and
              the chain pays them for it.
            </p>
            <div className="hero-actions">
              <button type="button" className="btn" onClick={() => go("compute")}>
                Run a task <span className="arrow">→</span>
              </button>
              <button type="button" className="btn ghost" onClick={() => go("docs")}>
                How it works
              </button>
            </div>
          </div>
          <Committee />
        </div>
        <NetworkStats />
      </section>

      <Reveal className="shell section">
        <div className="section-head">
          <div>
            <p className="kicker">Two ways in</p>
            <h2>Which one are you?</h2>
          </div>
        </div>
        <div className="paths">
          <article className="path-card">
            <p className="kicker">I have code to run</p>
            <h3>Run a task.</h3>
            <p>Write a small program, pick how many nodes check it, and set a reward.</p>
            <ul>
              <li>Write the code in the browser</li>
              <li>You pay only when a majority agrees</li>
              <li>A round that stalls gives the reward back</li>
            </ul>
            <button type="button" className="btn" onClick={() => go("compute")}>
              Run a task <span className="arrow">→</span>
            </button>
          </article>
          <article className="path-card dark">
            <p className="kicker" style={{ color: "var(--mint)" }}>
              I have a machine
            </p>
            <h3>Run a node.</h3>
            <p>Stake once and leave one program running. It earns a share of every task it gets right.</p>
            <ul>
              <li>Stake from your wallet</li>
              <li>One command starts the node</li>
              <li>A wrong answer costs part of the stake</li>
            </ul>
            <button type="button" className="btn" onClick={() => go("operate")}>
              Run a node <span className="arrow">→</span>
            </button>
          </article>
        </div>
      </Reveal>

      <Reveal className="shell section">
        <div className="section-head">
          <div>
            <p className="kicker">How a round works</p>
            <h2>Four moves. One majority.</h2>
          </div>
          <p>No node sees another node's answer before it has locked in its own.</p>
        </div>
        <ol className="steps">
          {STEPS.map(([index, title, copy]) => (
            <li key={index}>
              <span>{index}</span>
              <strong>{title}</strong>
              <p>{copy}</p>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal className="shell section">
        <div className="section-head">
          <div>
            <p className="kicker">Network</p>
            <h2>Live on devnet.</h2>
          </div>
          <button type="button" className="btn ghost" onClick={() => go("network")}>
            Open the explorer <span className="arrow">→</span>
          </button>
        </div>
        <div className="split">
          <div className="card flush">
            <RoundStatus />
            <RoundHistory limit={5} />
          </div>
          <div className="card flush">
            <NodeList />
          </div>
        </div>
      </Reveal>

    </>
  );
}

function Network({ go }) {
  const [tab, setTab] = useState("rounds");
  return (
    <div className="shell">
      <header className="page-head">
        <p className="kicker">Network</p>
        <h1>Rounds and nodes.</h1>
        <p className="lede">Everything here is read from the program's accounts on devnet.</p>
      </header>
      <Tabs
        items={[
          ["rounds", "Rounds"],
          ["nodes", "Nodes"],
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="tab-body" key={tab}>
        {tab === "rounds" ? (
          <div className="card flush">
            <RoundStatus />
            <MazeSummary onOpen={() => go("map")} />
            <RoundHistory />
          </div>
        ) : (
          <NodeBrowser />
        )}
      </div>
    </div>
  );
}

function Compute() {
  const wallet = useWallet();
  const [tab, setTab] = useState("task");
  return (
    <div className="shell">
      <header className="page-head">
        <p className="kicker">Run a task</p>
        <h1>Run your code on a committee.</h1>
        <p className="lede">Write the code, give it an input, set a reward. Your wallet signs once.</p>
      </header>
      {!wallet.address ? (
        <Gate
          title="Connect a wallet to start"
          copy="A task is paid from your wallet and settled by the program. Connect a Devnet wallet to create one."
        />
      ) : (
        <>
          <Tabs
            items={[
              ["task", "New task"],
              ["requests", "My requests"],
            ]}
            value={tab}
            onChange={setTab}
          />
          <div className="tab-body" key={tab}>
            {tab === "task" ? (
              <LaunchForm onOpenRequests={() => setTab("requests")} />
            ) : (
              <MyRequests owner={wallet.address} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Operate() {
  const wallet = useWallet();
  return (
    <div className="shell">
      <header className="page-head">
        <p className="kicker">Run a node</p>
        <h1>Earn by checking tasks.</h1>
        <p className="lede">Stake once, start one program, and leave it running.</p>
      </header>
      {!wallet.address ? (
        <Gate
          title="Connect the node's wallet"
          copy="The wallet that stakes owns the node. Connect it to stake, or to see the node it already runs."
        />
      ) : (
        <StakeForm />
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState(viewFromHash);
  const [menu, setMenu] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    function onHash() {
      setView(viewFromHash());
      setMenu(false);
      window.scrollTo(0, 0);
    }
    function onScroll() {
      setStuck(window.scrollY > 8);
    }
    window.addEventListener("hashchange", onHash);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  function go(next) {
    window.location.hash = next === "home" ? "/" : `/${next}`;
  }

  const current = view === "map" ? "network" : view;

  return (
    <div className="app">
      <div className="backdrop" aria-hidden="true" />
      <header className={stuck ? "site-header stuck" : "site-header"}>
        <div className="shell header-row">
          <button className="brand" type="button" onClick={() => go("home")}>
            <Mark />
            SolCloud
          </button>
          <nav className={menu ? "nav open" : "nav"} aria-label="Main">
            {NAV.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={current === id ? "on" : ""}
                aria-current={current === id ? "page" : undefined}
                onClick={() => go(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="header-tools">
            <a className="net-pill" href={explorerAddress(PROGRAM_ID)} target="_blank" rel="noreferrer">
              <i />
              Devnet
            </a>
            <WalletButton />
            <button
              type="button"
              className="menu-toggle"
              aria-label="Menu"
              aria-expanded={menu}
              onClick={() => setMenu((open) => !open)}
            >
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <main className="page" key={view}>
        {view === "network" ? (
          <Network go={go} />
        ) : view === "compute" ? (
          <Compute />
        ) : view === "operate" ? (
          <Operate />
        ) : view === "docs" ? (
          <Docs go={go} />
        ) : view === "map" ? (
          <MazeView onClose={() => go("network")} />
        ) : (
          <Home go={go} />
        )}
      </main>

      <footer className="site-footer">
        <div className="shell footer-row">
          <span>SolCloud · devnet · honest majority plus stake</span>
          <nav aria-label="Links">
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={explorerAddress(PROGRAM_ID)} target="_blank" rel="noreferrer">
              Program
            </a>
            <a href="#/docs">Docs</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
