import { createContext } from "react";
import type { TitleOf } from "../../lib/activity";

/** The titles of the task's plan nodes, for rows that name a task only by its id (TaskUpdate); the task page provides it. */
export const StepTitles = createContext<TitleOf>(() => undefined);
