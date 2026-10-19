import { test as base, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

interface Seed { tenant_id: string; principal_id: string; workspace_id: string }
export interface ToolCounts { wait_seconds: { started: number; finished: number }; notify_send: { started: number; finished: number } }
export const test = base.extend<{ seed: Seed; testMcpUrl: string; readCalls(marker: string): Promise<ToolCounts>; recordRun(id: string): Promise<void> }>({
  readCalls: async ({ request, testMcpUrl }, use) => {
    await use(async (marker) => {
      const response = await request.get(`${testMcpUrl}/__test/calls`, { params: { marker } });
      expect(response.ok()).toBe(true);
      return response.json() as Promise<ToolCounts>;
    });
  },
  seed: async ({ baseURL: _baseURL }, use) => {
    const file = process.env.ORBIT_E2E_SEED;
    if (!file || !process.env.ORBIT_E2E_BASE_URL) throw new Error("Run through infra scripts/v2-web-e2e.sh: seed and base URL are required");
    const seed: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!seed || typeof seed !== "object" || !["tenant_id", "principal_id", "workspace_id"].every((key) => key in seed && typeof (seed as Record<string, unknown>)[key] === "string")) throw new Error("Invalid E2E seed IDs");
    await use(seed as Seed);
  },
  testMcpUrl: async ({ baseURL: _baseURL }, use) => {
    const url = process.env.ORBIT_E2E_TESTMCP_URL;
    if (!url) throw new Error("ORBIT_E2E_TESTMCP_URL is required");
    await use(url);
  },
  recordRun: async ({ baseURL: _baseURL }, use, testInfo) => {
    await use(async (id) => {
      const file = path.resolve("e2e-artifacts/runs.json");
      await mkdir(path.dirname(file), { recursive: true });
      let runs: { test: string; project: string; run_id: string }[] = [];
      try { runs = JSON.parse(await readFile(file, "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      runs.push({ test: testInfo.title, project: testInfo.project.name, run_id: id });
      await writeFile(file, JSON.stringify(runs, null, 2) + "\n");
    });
  },
  page: async ({ page }, use, testInfo) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await use(page);
    if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach("console-errors", { body: errors.join("\n"), contentType: "text/plain" });
  },
});
export { expect };
