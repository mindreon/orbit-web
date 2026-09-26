/** 分享记录只留在这次打开的页面里。链接指向云端任务，不写本机文件。 */

import { mockArtifacts } from "./mockRooms";

export type SharedTask = {
  matterId: string;
  title: string;
  sharedAt: string;
  link: string;
};

export type SharedFile = {
  id: string;
  name: string;
  matterId: string;
  taskTitle: string;
  sharedAt: string;
  link: string;
};

let tasks: SharedTask[] = [];
let files: SharedFile[] = [];
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function taskShareLink(matterId: string) {
  return `${location.origin}/task/${matterId}`;
}

export function fileShareLink(matterId: string, name: string) {
  return `${location.origin}/task/${matterId}?file=${encodeURIComponent(name)}`;
}

export function getSharedTasks() {
  return tasks;
}

export function getSharedFiles() {
  return files;
}

export function subscribeShares(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishTaskShare(matterId: string, title: string) {
  const sharedAt = today();
  const link = taskShareLink(matterId);
  tasks = [{ matterId, title, sharedAt, link }, ...tasks.filter((item) => item.matterId !== matterId)];
  for (const artifact of mockArtifacts(matterId)) {
    publishFileShare({ matterId, taskTitle: title, fileId: artifact.id, name: artifact.name, sharedAt });
  }
  emit();
  return link;
}

export function publishFileShare(input: { matterId: string; taskTitle: string; fileId: string; name: string; sharedAt?: string }) {
  const sharedAt = input.sharedAt ?? today();
  const next: SharedFile = {
    id: input.fileId,
    name: input.name,
    matterId: input.matterId,
    taskTitle: input.taskTitle,
    sharedAt,
    link: fileShareLink(input.matterId, input.name),
  };
  files = [next, ...files.filter((item) => item.id !== next.id)];
  if (!input.sharedAt) emit();
}

export function cancelSharedTask(matterId: string) {
  tasks = tasks.filter((item) => item.matterId !== matterId);
  emit();
}

export function cancelSharedFile(id: string) {
  files = files.filter((item) => item.id !== id);
  emit();
}

export function refreshSharedFile(id: string) {
  const sharedAt = today();
  files = files.map((item) => (item.id === id ? { ...item, sharedAt } : item));
  emit();
}
