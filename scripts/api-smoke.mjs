#!/usr/bin/env node
/**
 * Automated API smoke for the dsh workbench.
 * No browser video — fetch-only regression against orbit-control.
 */
const CONTROL = process.env.ORBIT_CONTROL_URL ?? 'http://127.0.0.1:8080';

async function req(path, init = {}) {
  const res = await fetch(`${CONTROL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text}`);
  return body;
}

const health = await req('/health');
if (health.status !== 'ok') throw new Error('health failed');

const persona = await req('/v1/personas', {
  method: 'POST',
  body: JSON.stringify({ name: 'Smoke Reviewer', instructions: 'Be brief' }),
});
const room = await req('/v1/rooms', {
  method: 'POST',
  body: JSON.stringify({
    kind: 'solo',
    title: `api-smoke-${Date.now()}`,
    permissionPreset: 'workspace-write',
    personaId: persona.id,
  }),
});
const posted = await req(`/v1/rooms/${room.id}/messages`, {
  method: 'POST',
  body: JSON.stringify({ message: 'list workspace files' }),
});
if (posted.approval) {
  await req(`/v1/approvals/${posted.approval.id}/decide`, {
    method: 'POST',
    body: JSON.stringify({ decision: 'allow' }),
  });
}
await req(`/v1/rooms/${room.id}/steer`, {
  method: 'POST',
  body: JSON.stringify({ instruction: 'focus on README only' }),
});
const activity = await req(`/v1/rooms/${room.id}/activity`);
if (!Array.isArray(activity.items) || activity.items.length === 0) {
  throw new Error('expected activity items');
}
console.log(JSON.stringify({
  ok: true,
  roomId: room.id,
  personaId: persona.id,
  activity: activity.items.length,
  permissionPreset: room.permissionPreset,
  runtime: room.runtime,
}, null, 2));
