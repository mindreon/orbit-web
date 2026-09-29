/** Helpers for the acceptance E2E against the running stack (mock model mode). */
import { expect, type APIRequestContext } from "@playwright/test";

export { metrics, shot, verify } from "../helpers";

export const CONTROL_URL = "http://127.0.0.1:18180";
const RELAY_ADMIN = "http://127.0.0.1:18183";

/** Cuts every live connection between the browser and control (the SSE stream too) and refuses new ones for `holdMs`. */
export async function networkOutage(request: APIRequestContext, holdMs: number) {
  const response = await request.post(`${RELAY_ADMIN}/drop?holdMs=${holdMs}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).dropped as number;
}
