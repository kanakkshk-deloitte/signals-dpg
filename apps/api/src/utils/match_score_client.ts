import type {
  MatchScoreClient,
  MatchScoreProvider,
} from '@dpg/match_score';
import { createMatchScoreClient } from '@dpg/match_score';
import { matchScoreConfig } from '@/config';

export const getMatchScoreClient = () => {
  switch (matchScoreConfig.provider) {
    case 'signals_search': {
      const signalsSearch = matchScoreConfig.signals_search;

      if (!signalsSearch.endpoint || !signalsSearch.api_key) {
        return undefined;
      }

      return createMatchScoreClient({
        provider: 'signals_search',
        baseUrl: signalsSearch.endpoint,
        apiKey: signalsSearch.api_key,
        path: signalsSearch.path,
      });
    }

    default:
      return undefined;
  }

  const dpgScoring = matchScoreConfig.dpg_scoring;

  if (!dpgScoring.endpoint || !dpgScoring.key_id || !dpgScoring.secret) {
    return undefined;
  }

  return createMatchScoreClient({
    provider: 'dpg_scoring',
    baseUrl: dpgScoring.endpoint,
    keyId: dpgScoring.key_id,
    secret: dpgScoring.secret,
    path: dpgScoring.path,
    version: dpgScoring.version,
    promptVersion: dpgScoring.prompt_version,
  });
};
