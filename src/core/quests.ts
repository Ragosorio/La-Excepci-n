/** Designios (quests): main, side and contracts. UI (tracker) lives in the overworld HUD. */
import { bus } from './events';
import { G, res, type QuestState } from './state';

declare module './events' {
  interface GameEvents {
    'quest:added': { quest: QuestState };
    'quest:progress': { quest: QuestState };
    'quest:done': { quest: QuestState };
    'quest:failed': { quest: QuestState };
  }
}

export function getQuest(id: string): QuestState | undefined { return G.run.quests.find((q) => q.id === id); }
export function activeQuests(): QuestState[] { return G.run.quests.filter((q) => !q.done && !q.failed); }

export function addQuest(q: Omit<QuestState, 'progress' | 'done' | 'createdLuna'> & { progress?: number }): QuestState {
  const existing = getQuest(q.id);
  if (existing) return existing;
  const quest: QuestState = { progress: 0, done: false, createdLuna: G.run.luna, ...q };
  G.run.quests.push(quest);
  bus.emit('quest:added', { quest });
  return quest;
}

/** Set (absolute) or add (relative) progress. Completes automatically when reaching goal. */
export function progressQuest(id: string, amount = 1, absolute = false): void {
  const q = getQuest(id);
  if (!q || q.done || q.failed) return;
  q.progress = absolute ? amount : q.progress + amount;
  bus.emit('quest:progress', { quest: q });
  if (q.progress >= q.goal) completeQuest(id);
}

export function completeQuest(id: string): void {
  const q = getQuest(id);
  if (!q || q.done) return;
  q.done = true;
  q.progress = Math.max(q.progress, q.goal);
  const r = q.reward;
  if (r) {
    if (r.gold) res.add('gold', r.gold);
    if (r.essence) res.add('essence', r.essence);
    if (r.influence) res.add('influence', r.influence);
    if (r.secrets) res.add('secrets', r.secrets);
  }
  bus.emit('quest:done', { quest: q });
}

export function failQuest(id: string): void {
  const q = getQuest(id);
  if (!q || q.done) return;
  q.failed = true;
  bus.emit('quest:failed', { quest: q });
}
