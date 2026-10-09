// How to start the program that does a node's work.
export function ListenerSetup() {
  return (
    <>
      <p className="note" style={{ margin: "0 0 20px" }}>
        <b>The node program runs on your machine.</b> A web page cannot start a program on your computer, so you
        start it once in a terminal.
      </p>
      <ol className="setup">
        <li>
          <strong>Get it</strong>
          <p>Needs Node.js 22 or newer.</p>
          <pre className="code">{`git clone https://github.com/aleksitk/solcloud
cd solcloud/worker && npm install`}</pre>
        </li>
        <li>
          <strong>Start it</strong>
          <p>Point it at the key file of the wallet that staked.</p>
          <pre className="code">node listener.mjs ~/.config/solana/node.json</pre>
        </li>
        <li>
          <strong>Leave it running</strong>
          <p>It finds its tasks, answers them, and collects rewards. If it is off when your node is picked, that round stalls.</p>
        </li>
      </ol>
    </>
  );
}
