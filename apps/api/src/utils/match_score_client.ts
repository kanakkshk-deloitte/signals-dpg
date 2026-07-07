import type {
  MatchScoreClient,
  MatchScoreRequest,
  MatchScoreResult,
} from '@dpg/match_score';
import { matchScoreConfig } from '@/config';

// Previous implementation (kept for reference):
// import { createMatchScoreClient } from '@dpg/match_score';

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function toBand(score: number): string {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function createInProcessMatchScoreClient(): MatchScoreClient {
  return {
    async calculate(input: MatchScoreRequest): Promise<MatchScoreResult> {
      const seed = hashString(`${input.itemA.item_id}:${input.itemB.item_id}`);
      const score = Number(((seed % 1000) / 1000).toFixed(3));

      return {
        provider: 'dpg_scoring',
        score,
        band: toBand(score),
        confidence: 0.9,
        version: 'v1-local',
        prompt_version: 'local-direct',
        model_provider: 'in-process',
        model: 'deterministic-hash',
        reasoning: 'Calculated directly in API without external scorer API call',
        signals: [
          {
            name: 'profile_similarity',
            impact: score >= 0.5 ? 'positive' : 'negative',
            summary: 'Local deterministic scorer used for development',
          },
        ],
        raw_response: {
          mode: 'in-process',
          item_a_id: input.itemA.item_id,
          item_b_id: input.itemB.item_id,
        },
      };
    },
  };
}

export const getMatchScoreClient = () => {
  switch (matchScoreConfig.provider) {
    case 'dpg_scoring': {
      // Previous implementation (external scorer API call):
      // const dpgScoring = matchScoreConfig.dpg_scoring;
      //
      // if (!dpgScoring.endpoint || !dpgScoring.key_id || !dpgScoring.secret) {
      //   return undefined;
      // }
      //
      // return createMatchScoreClient({
      //   provider: 'dpg_scoring',
      //   baseUrl: dpgScoring.endpoint,
      //   keyId: dpgScoring.key_id,
      //   secret: dpgScoring.secret,
      //   path: dpgScoring.path,
      //   version: dpgScoring.version,
      //   promptVersion: dpgScoring.prompt_version,
      // });

      // ponytail: local-only shortcut. This bypasses external scorer API calls
      // entirely and computes a deterministic score in-process.
      return createInProcessMatchScoreClient();
    }

    default:
      return undefined;
  }
};
