import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to know the design system's custom names: without this it reads `text-caption` as a text
 * colour and silently drops it when a colour class follows (a 16px badge instead of 12px), and `rounded-card`
 * would not override `rounded-control`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["caption", "small", "body", "title", "heading", "display"] }],
      rounded: [{ rounded: ["control", "card", "bubble"] }],
      "max-w": [{ "max-w": ["reading"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
