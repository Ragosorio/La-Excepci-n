/** World news / rumors feed. The overworld shows a ticker; taverns repeat rumors. */
import { bus } from './events';
import { G, type NewsItem } from './state';

declare module './events' {
  interface GameEvents { 'news:add': { item: NewsItem } }
}

export function addNews(text: string, kind: NewsItem['kind'] = 'rumor', important = false): void {
  if (!G.run) return;
  const item: NewsItem = { luna: G.run.luna, text, kind, important };
  G.run.news.unshift(item);
  if (G.run.news.length > 80) G.run.news.length = 80;
  bus.emit('news:add', { item });
}

export function recentNews(n = 10): NewsItem[] { return G.run?.news.slice(0, n) ?? []; }
