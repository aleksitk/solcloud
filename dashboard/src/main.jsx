import "./polyfill.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { FunctionProvider } from "./functionChoice.jsx";
import { WalletProvider } from "./wallet.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <WalletProvider>
      <FunctionProvider>
        <App />
      </FunctionProvider>
    </WalletProvider>
  </StrictMode>
);
