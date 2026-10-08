import { createContext, useContext, useState } from "react";
import { WASM_HASH } from "./requestTask.js";

const LABYRINTH = { name: "Labyrinth", hash: WASM_HASH, bytes: null };
const FunctionChoiceContext = createContext(null);

export function FunctionProvider({ children }) {
  const [choice, setChoice] = useState(LABYRINTH);
  const [compiled, setCompiled] = useState(null);

  function chooseLabyrinth() {
    setChoice(LABYRINTH);
  }

  function chooseCompiled(next) {
    setCompiled(next);
    setChoice(next);
  }

  return (
    <FunctionChoiceContext.Provider value={{ choice, compiled, chooseLabyrinth, chooseCompiled }}>
      {children}
    </FunctionChoiceContext.Provider>
  );
}

export function useFunctionChoice() {
  const value = useContext(FunctionChoiceContext);
  if (!value) throw new Error("Function choice is missing.");
  return value;
}
