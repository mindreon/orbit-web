/** Helpers for the acceptance E2E against the running stack (mock model mode). */
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export { metrics, shot } from "../helpers";

/** orbit-worker's mock model streams a `stream:` prompt back as assistant.delta chunks split at U+001F. */
export const CHUNK = "\u001f";
export const streamPrompt = (parts: string[]) => `stream:${parts.join(CHUNK)}`;
/** `echo:` makes the mock call the approval-gated `gated_echo` tool. */
export const echoPrompt = (text: string) => `echo:${text}`;

/** Control's public listener, bypassing orbit-web's proxy and the outage relay: "another client". */
export const CONTROL_URL = "http://127.0.0.1:18180";
const RELAY_ADMIN = "http://127.0.0.1:18183";

/** Cuts every live connection between the browser and control (the SSE stream too) and refuses new ones for `holdMs`. */
export async function networkOutage(request: APIRequestContext, holdMs: number) {
  const response = await request.post(`${RELAY_ADMIN}/drop?holdMs=${holdMs}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()).dropped as number;
}

export type Envelope = { id?: number; type: string; source: string; payload: Record<string, unknown> };

export async function newRoom(request: APIRequestContext, title: string): Promise<string> {
  const response = await request.post("/v1/rooms", { data: { kind: "solo", title, permissionPreset: "workspace-write" } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id as string;
}

export async function activity(request: APIRequestContext, roomId: string): Promise<Envelope[]> {
  const response = await request.get(`/v1/rooms/${roomId}/activity`);
  expect(response.ok()).toBeTruthy();
  return ((await response.json()).items ?? []) as Envelope[];
}

/** Posts a message through control's public API (as another client would) and waits for the turn to return. */
export async function postMessage(request: APIRequestContext, roomId: string, message: string, base = "") {
  const response = await request.post(`${base}/v1/rooms/${roomId}/messages`, { data: { message }, timeout: 120_000 });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

/** Opens the task and waits until its SSE stream has answered (headers received; the body never ends). */
export async function openRoom(page: Page, roomId: string) {
  const stream = page.waitForResponse((response) => response.url().includes(`/v1/rooms/${roomId}/events`) && response.status() === 200);
  await page.goto(`/task/${roomId}`);
  await expect(page.getByLabel("输入消息")).toBeVisible();
  await stream;
}

/** Types into the real composer and presses Enter. `fill` keeps the U+001F separators of stream prompts. */
export async function send(page: Page, text: string) {
  const box = page.getByLabel("输入消息");
  await box.fill(text);
  await box.press("Enter");
}

export const assistantItems = (page: Page) => page.locator('[data-testid="chat-item"][data-kind="assistant"]');
export const userItems = (page: Page) => page.locator('[data-testid="chat-item"][data-kind="user"]');
export const toolRows = (page: Page) => page.getByTestId("tool-row");
export const approvalCards = (page: Page) => page.getByTestId("approval-card");
