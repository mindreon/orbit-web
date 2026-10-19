import { createContext } from "react";
import type { InboxSource } from "./inboxSource";
export const InboxSourceContext = createContext<InboxSource | null>(null);
