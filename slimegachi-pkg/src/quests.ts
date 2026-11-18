/** SLIMEgachi — the daily quest pool. Three are drawn at random each day. */
import type { QuestDef } from './types';

export const QUEST_POOL: QuestDef[] = [
  {
    id: 'feed_any_3',
    label: 'Feed pets 3 times today',
    target: 3, reward: 10,
    track(ev) { return ev.type === 'care_action' && ev.action === 'feed' ? 1 : 0; }
  },
  {
    id: 'feed_any_6',
    label: 'Feed pets 6 times today',
    target: 6, reward: 16,
    track(ev) { return ev.type === 'care_action' && ev.action === 'feed' ? 1 : 0; }
  },
  {
    id: 'feed_favorite',
    label: 'Feed a pet its favorite food',
    target: 1, reward: 12,
    track(ev) { return ev.type === 'care_action' && ev.action === 'feed' && ev.isFavoriteFood ? 1 : 0; }
  },
  {
    id: 'play_mini',
    label: 'Complete a mini-game',
    target: 1, reward: 8,
    track(ev) { return ev.type === 'minigame_complete' && !ev.forfeit ? 1 : 0; }
  },
  {
    id: 'mini_score_30',
    label: 'Score 30+ in a mini-game',
    target: 1, reward: 12,
    track(ev) { return ev.type === 'minigame_complete' && ev.score >= 30 ? 1 : 0; }
  },
  {
    id: 'mini_score_60',
    label: 'Score 60+ in a mini-game',
    target: 1, reward: 20,
    track(ev) { return ev.type === 'minigame_complete' && ev.score >= 60 ? 1 : 0; }
  },
  {
    id: 'clean_3',
    label: 'Clean pets 3 times today',
    target: 3, reward: 10,
    track(ev) { return ev.type === 'care_action' && ev.action === 'clean' ? 1 : 0; }
  },
  {
    id: 'sleep_2',
    label: 'Put pets to sleep 2 times',
    target: 2, reward: 10,
    track(ev) { return ev.type === 'care_action' && ev.action === 'sleep' ? 1 : 0; }
  },
  {
    id: 'play_action_3',
    label: 'Take 5 care actions today',
    target: 5, reward: 8,
    track(ev) { return ev.type === 'care_action' ? 1 : 0; }
  }
];
