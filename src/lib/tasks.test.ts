import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ api: vi.fn() }));

import { api } from "./api";
import {
  controlTask,
  createTask,
  decideTaskApproval,
  getArtifactURL,
  getPlan,
  getTask,
  listProfiles,
  listTaskArtifacts,
  listTasks,
  sendTaskMessage,
  subscribeTaskEvents,
  type TaskEvent,
} from "./tasks";

const apiMock = vi.mocked(api);

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({});
});

describe("task requests", () => {
  it("lists tasks and treats a missing items field as an empty list", async () => {
    apiMock.mockResolvedValueOnce({ items: [{ task_id: "t1" }] });
    await expect(listTasks()).resolves.toEqual([{ task_id: "t1" }]);
    expect(apiMock).toHaveBeenCalledWith("/v1/tasks");
    apiMock.mockResolvedValueOnce({});
    await expect(listTasks()).resolves.toEqual([]);
  });

  it("creates a task with a JSON body", async () => {
    await createTask({ title: "T", goal: "G", profile: "p" });
    expect(apiMock).toHaveBeenCalledWith("/v1/tasks", { method: "POST", body: JSON.stringify({ title: "T", goal: "G", profile: "p" }) });
  });

  it("escapes the task id in every path", async () => {
    await getTask("a/b c");
    await getPlan("a/b c");
    expect(apiMock).toHaveBeenNthCalledWith(1, "/v1/tasks/a%2Fb%20c");
    expect(apiMock).toHaveBeenNthCalledWith(2, "/v1/tasks/a%2Fb%20c/plan");
  });

  it("lists artifacts and treats a missing items field as an empty list", async () => {
    apiMock.mockResolvedValueOnce({ items: [{ manifest_id: "m1" }] });
    await expect(listTaskArtifacts("t1")).resolves.toEqual([{ manifest_id: "m1" }]);
    expect(apiMock).toHaveBeenCalledWith("/v1/tasks/t1/artifacts");
    apiMock.mockResolvedValueOnce({});
    await expect(listTaskArtifacts("t1")).resolves.toEqual([]);
  });

  it("asks for an artifact url with the manifest id and name escaped, and returns only the url", async () => {
    apiMock.mockResolvedValueOnce({ url: "https://minio/x" });
    await expect(getArtifactURL("m/1", "out file.txt")).resolves.toBe("https://minio/x");
    expect(apiMock).toHaveBeenCalledWith("/v1/artifacts/m%2F1/url?name=out%20file.txt");
  });

  it("lists profiles", async () => {
    apiMock.mockResolvedValueOnce({ items: [{ profile_id: "p1" }] });
    await expect(listProfiles()).resolves.toEqual([{ profile_id: "p1" }]);
    expect(apiMock).toHaveBeenCalledWith("/v1/profiles");
  });

  it("sends a message queued by default and interrupting when asked", async () => {
    await sendTaskMessage("t1", "hi");
    await sendTaskMessage("t1", "stop", "interrupt");
    expect(apiMock).toHaveBeenNthCalledWith(1, "/v1/tasks/t1/messages", { method: "POST", body: JSON.stringify({ text: "hi", delivery: "queue" }) });
    expect(apiMock).toHaveBeenNthCalledWith(2, "/v1/tasks/t1/messages", { method: "POST", body: JSON.stringify({ text: "stop", delivery: "interrupt" }) });
  });

  it("posts control actions and approval decisions", async () => {
    await controlTask("t1", "pause");
    await decideTaskApproval("t1", "ap/1", "approve");
    expect(apiMock).toHaveBeenNthCalledWith(1, "/v1/tasks/t1/control", { method: "POST", body: JSON.stringify({ action: "pause" }) });
    expect(apiMock).toHaveBeenNthCalledWith(2, "/v1/tasks/t1/approvals/ap%2F1", { method: "POST", body: JSON.stringify({ decision: "approve" }) });
  });

  it("does not swallow a failed request", async () => {
    apiMock.mockRejectedValueOnce(new Error("boom"));
    await expect(getTask("t1")).rejects.toThrow("boom");
  });
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

describe("subscribeTaskEvents", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reports connected/reconnecting, parses frames, and closes the source on unsubscribe", () => {
    const onEvent = vi.fn();
    const onState = vi.fn();
    const stop = subscribeTaskEvents("a/b", onEvent, onState);
    const source = FakeEventSource.instances[0]!;
    expect(source.url).toBe("/v1/tasks/a%2Fb/events");

    source.onopen?.();
    source.onerror?.();
    expect(onState.mock.calls).toEqual([["connected"], ["reconnecting"]]);

    const frame: Partial<TaskEvent> = { seq: 1, event_id: "evt_1", type: "attempt.started" };
    source.onmessage?.({ data: JSON.stringify(frame) });
    expect(onEvent).toHaveBeenCalledWith(frame);

    stop();
    expect(source.closed).toBe(true);
  });
});
