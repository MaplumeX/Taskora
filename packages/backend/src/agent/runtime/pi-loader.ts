import type { Agent, AgentOptions } from '@earendil-works/pi-agent-core';
import type {
  AssistantMessageEventStream,
  Context,
  Model,
  SimpleStreamOptions,
} from '@earendil-works/pi-ai';

/**
 * Runtime loader for the ESM-only pi packages.
 *
 * The backend compiles to CommonJS (NestJS default) while
 * `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` only expose
 * `import` conditions in their exports maps. TypeScript's CommonJS emit turns
 * `await import('pkg')` into `require('pkg')`, which cannot resolve those
 * packages. A dynamic import built through the `Function` constructor keeps
 * the real ESM `import()` at runtime and works under `nest start`, the
 * compiled build and vitest alike. Values are cached after the first load.
 */
const dynamicImport = new Function('specifier', 'return import(specifier)') as <T>(
  specifier: string,
) => Promise<T>;

/**
 * Load an ESM module. The Function-based import() works in real Node (both
 * CJS and ESM contexts); vitest's module runner does not support it, so we
 * fall back to the static import() form there (vite transforms it).
 */
async function importModule<T>(specifier: string): Promise<T> {
  try {
    return await dynamicImport<T>(specifier);
  } catch {
    return (await import(/* @vite-ignore */ specifier)) as T;
  }
}

type PiAgentModule = {
  Agent: new (options: AgentOptions) => Agent;
};

export type CompletionsStreamFn = (
  model: Model<'openai-completions'>,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream;

type PiCompletionsModule = {
  streamSimple: CompletionsStreamFn;
};

let cachedAgentModule: PiAgentModule | undefined;
let cachedCompletionsModule: PiCompletionsModule | undefined;

export async function loadPiAgentModule(): Promise<PiAgentModule> {
  cachedAgentModule ??= (await importModule<PiAgentModule>(
    '@earendil-works/pi-agent-core',
  )) as PiAgentModule;
  return cachedAgentModule;
}

export async function loadCompletionsStreamFn(): Promise<CompletionsStreamFn> {
  cachedCompletionsModule ??= (await importModule<PiCompletionsModule>(
    '@earendil-works/pi-ai/api/openai-completions',
  )) as PiCompletionsModule;
  return cachedCompletionsModule.streamSimple;
}
