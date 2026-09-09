import { createRoot } from "react-dom/client";
import { Router } from "./Router";
import "./styles.css";
import { SurvivalRuntimeProvider } from "../../app/survival/use-survival-runtime";

createRoot(document.getElementById("root")!).render(<SurvivalRuntimeProvider><Router /></SurvivalRuntimeProvider>);
