/** Shared helpers for the E2E specs that drive e2e/fake-control.mjs. */
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const CONTROL = "http://127.0.0.1:18080";
export const ROOM = "room-e2e";

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

export async function emit(request: APIRequestContext, frames: Frame | Frame[]) {
  const result = await control(request, "/__test/emit", frames);
  expect(result.delivered).toBeGreaterThan(0);
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

