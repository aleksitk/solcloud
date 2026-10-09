import { createContext, useContext, useState } from "react";
import { STARTER } from "./starter.js";

const FunctionChoiceContext = createContext(null);

// The editor's source and its last compile live here, so they survive a tab change.
export function FunctionProvider({ children }) {
  const [source, setSourceText] = useState(STARTER);
  const [compiled, setCompiledValue] = useState(null);
  // True once the compiled module is complete on chain under the connected wallet.
  const [published, setPublished] = useState(false);

  function setCompiled(next) {
    setCompiledValue(next);
    setPublished(false);
  }

  // An edit after a compile makes the stored hash stale.
  function setSource(next) {
    setSourceText(next);
    setCompiled(null);
  }

  return (
    <FunctionChoiceContext.Provider value={{ source, setSource, compiled, setCompiled, published, setPublished }}>
      {children}
    </FunctionChoiceContext.Provider>
  );
}

export function useFunctionChoice() {
  const value = useContext(FunctionChoiceContext);
  if (!value) throw new Error("Function choice is missing.");
  return value;
}
