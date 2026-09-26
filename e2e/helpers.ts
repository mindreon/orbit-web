/** Shared helpers for the E2E specs that drive e2e/fake-control.mjs. */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/** Screenshot attached to the test, so the acceptance report carries it as evidence. */
export async function shot(page: Page, name: string, options: { fullPage?: boolean } = {}) {
  const path = test.info().outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: options.fullPage });
  await test.info().attach(name, { path, contentType: "image/png" });
}

/** Numbers attached to the test; the acceptance report merges them per acceptance item. */
export async function metrics(values: Record<string, unknown>) {
  await test.info().attach("metrics", { body: JSON.stringify(values), contentType: "application/json" });
}

export const CONTROL = "http://127.0.0.1:18080";
export const ROOM = "room-e2e";

/** An SSE frame. Without `id` the fake control assigns the next per-task sequence, as orbit-control does (C33). */
export type Frame = { id?: string; event?: string; data?: unknown };

export function activity(id: string, sequence: number, patch: Record<string, unknown>) {
  return {
    id,
    sequence,
    roomId: ROOM,
    sessionId: "ses-e2e",
    source: "worker",
    agentId: "main",
    agentPath: "main",
    occurredAt: new Date(Date.UTC(2026, 8, 26, 8, 0, sequence)).toISOString(),
    ...patch,
  };
}

export function delta(turnId: string, blockId: string, seq: number, text: string, activityAttempt = 1) {
  return {
    type: "assistant.delta",
    roomId: ROOM,
    sessionId: "ses-e2e",
    agentId: "main",
    agentPath: "main",
    turnId,
    blockId,
    seq,
    activityAttempt,
    delta: text,
  };
}

export async function control(request: APIRequestContext, path: string, body?: unknown) {
  const response = await request.post(`${CONTROL}${path}`, { data: body ?? {} });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

/** Sends frames on the open stream and returns the SSE ids they went out with. */
export async function emit(request: APIRequestContext, frames: Frame | Frame[]): Promise<string[]> {
  const result = await control(request, "/__test/emit", frames);
  expect(result.delivered).toBeGreaterThan(0);
  return result.ids as string[];
}

export async function log(request: APIRequestContext) {
  const response = await request.get(`${CONTROL}/__test/log`);
  return (await response.json()) as {
    events: { lastEventIdHeader: string | null; lastEventIdQuery: string | null }[];
    activity: number;
    open: number;
    posts: { message: string; turnId: string }[];
  };
}

export async function waitForStreams(request: APIRequestContext, count: number) {
  await expect.poll(async () => {
    const current = await log(request);
    return current.open > 0 ? current.events.length : 0;
  }).toBe(count);
}

export async function openRoom(page: Page, request: APIRequestContext) {
  await page.goto(`/task/${ROOM}`);
  await waitForStreams(request, 1);
}

export const draft = (page: Page) => page.getByTestId("assistant-draft");
export const assistant = (page: Page) => page.locator('[data-testid="chat-item"][data-kind="assistant"]');
export const toolRows = (page: Page) => page.getByTestId("tool-row");

