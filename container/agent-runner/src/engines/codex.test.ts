import { describe, expect, it } from 'vitest';

import {
  resolveCodexReasoningEffort,
  resolveCodexAuth,
  resolveCodexModel,
} from './codex.js';

describe('Codex env resolution', () => {
  it('selects model from CODEX_MODEL first, then OPENAI_MODEL, then AGENT_MODEL', () => {
    expect(
      resolveCodexModel({
        CODEX_MODEL: 'codex-preferred',
        OPENAI_MODEL: 'openai-masked',
        AGENT_MODEL: 'agent-fallback',
      }),
    ).toBe('codex-preferred');

    expect(
      resolveCodexModel({
        OPENAI_MODEL: 'openai-first',
        AGENT_MODEL: 'agent-fallback',
      }),
    ).toBe('openai-first');

    expect(
      resolveCodexModel({
        AGENT_MODEL: 'agent-only',
      }),
    ).toBe('agent-only');
  });

  it('falls back to default model when no model env is set', () => {
    expect(resolveCodexModel({})).toBe('gpt-5.3-codex');
  });

  it('defaults model reasoning effort to xhigh', () => {
    expect(resolveCodexReasoningEffort({})).toBe('xhigh');
  });

  it('honors explicit reasoning effort env', () => {
    expect(
      resolveCodexReasoningEffort({
        CODEX_MODEL_REASONING_EFFORT: 'high',
      }),
    ).toBe('high');
  });

  it('prioritizes CODEX_API_KEY over OPENAI_API_KEY for auth', () => {
    expect(
      resolveCodexAuth({
        CODEX_API_KEY: 'codex-key',
        OPENAI_API_KEY: 'openai-key',
      }),
    ).toMatchObject({
      apiKey: 'codex-key',
    });
  });

  it('falls back to OPENAI_API_KEY and passes OPENAI_BASE_URL', () => {
    expect(
      resolveCodexAuth({
        OPENAI_API_KEY: 'openai-key',
        OPENAI_BASE_URL: 'https://example.test/v1',
      }),
    ).toMatchObject({
      apiKey: 'openai-key',
      baseUrl: 'https://example.test/v1',
    });
  });
});
