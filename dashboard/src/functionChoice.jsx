import { createContext, useContext, useState } from "react";
import { STARTER } from "./starter.js";

const FunctionChoiceContext = createContext(null);

// The editor's source and its last compile live here, so they survive a tab change.
export function FunctionProvider({ children }) {
  const [source, setSourceText] = useState(STARTER);
  const [compiled, setCompiled] = useState(null);

  // An edit after a compile makes the stored hash stale.
  function setSource(next) {
    setSourceText(next);
    setCompiled(null);
  }

  return (
    <FunctionChoiceContext.Provider value={{ source, setSource, compiled, setCompiled }}>
      {children}
    </FunctionChoiceContext.Provider>
  );
}

export function useFunctionChoice() {
  const value = useContext(FunctionChoiceContext);
  if (!value) throw new Error("Function choice is missing.");
  return value;
}
