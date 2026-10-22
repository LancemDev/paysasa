import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { missingEnv } from "./lib/env";
import { ConfigError } from "./pages/ConfigError";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{missingEnv.length ? <ConfigError missing={missingEnv} /> : <App />}</StrictMode>,
);
