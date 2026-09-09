import { createContext } from "react";
import type { SurvivalRuntime } from "./use-survival-runtime";

// A separate stable module keeps the provider and consumers aligned during hot updates.
export const SurvivalRuntimeContext = createContext<SurvivalRuntime | null>(null);
