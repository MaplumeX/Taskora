import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { agentKeys, invalidateDomainData } from './useAgent';

describe('invalidateDomainData', () => {
  it('invalidates every domain cache (lists and details)', () => {
    const queryClient = new QueryClient();
    const domainKeys: (readonly unknown[])[] = [
      ['areas'],
      ['area', 'a1'],
      ['projects'],
      ['project', 'p1'],
      ['tasks'],
      ['task', 't1'],
      ['tags'],
      ['tag', 'g1'],
      ['tag-groups'],
      ['tag-group', 'gg1'],
      ['project-headings'],
      ['feed', 'today'],
    ];
    for (const key of domainKeys) {
      queryClient.setQueryData(key, {});
    }

    invalidateDomainData(queryClient);

    for (const key of domainKeys) {
      expect(queryClient.getQueryState(key)?.isInvalidated, `key ${JSON.stringify(key)}`).toBe(
        true,
      );
    }
  });

  it('leaves non-domain caches (assistant, users) untouched', () => {
    const queryClient = new QueryClient();
    const otherKeys: (readonly unknown[])[] = [
      agentKeys.config,
      agentKeys.conversations,
      agentKeys.messages('c1'),
      ['users'],
    ];
    for (const key of otherKeys) {
      queryClient.setQueryData(key, {});
    }

    invalidateDomainData(queryClient);

    for (const key of otherKeys) {
      expect(queryClient.getQueryState(key)?.isInvalidated, `key ${JSON.stringify(key)}`).toBe(
        false,
      );
    }
  });
});
