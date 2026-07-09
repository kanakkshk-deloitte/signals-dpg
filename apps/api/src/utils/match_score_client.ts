import type {
  MatchScoreClient,
  MatchScoreProvider,
} from '@dpg/match_score';
import { createMatchScoreClient } from '@dpg/match_score';
import { matchScoreConfig } from '@/config';

export const getMatchScoreClient = () => {
  const provider = matchScoreConfig.provider as MatchScoreProvider | undefined;

  if (provider !== 'dpg_scoring') {
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
