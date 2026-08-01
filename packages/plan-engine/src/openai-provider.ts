import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { planAdvisorySchema, type PlanAdvisory } from '@readycircle/contracts';
import { ADVISORY_SYSTEM_PROMPT, buildAdvisoryUserPrompt, type AdvisoryProvider } from './advisory.js';
import type { PlanContext } from './types.js';

export interface OpenAiAdvisoryProviderOptions {
  apiKey: string;
  model: string;
}

/** Used when no OpenAI key is configured: generation fails with a clear, user-visible reason instead of at startup. */
class UnconfiguredAdvisoryProvider implements AdvisoryProvider {
  generateAdvisory(): Promise<never> {
    return Promise.reject(
      new Error('AI plan generation is not configured (OPENAI_API_KEY is missing). Set it and retry.'),
    );
  }
}

export function createAdvisoryProvider(options: OpenAiAdvisoryProviderOptions): AdvisoryProvider {
  if (!options.apiKey) {
    return new UnconfiguredAdvisoryProvider();
  }
  return new OpenAiAdvisoryProvider(options);
}

/**
 * OpenAI-backed advisory provider using strict Structured Outputs: the
 * response is constrained to `planAdvisorySchema`'s JSON schema server-side,
 * then parsed and re-validated with Zod, so malformed advisory content can
 * never reach the database.
 */
export class OpenAiAdvisoryProvider implements AdvisoryProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAiAdvisoryProviderOptions) {
    if (!options.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured; cannot create the OpenAI advisory provider.');
    }
    this.client = new OpenAI({ apiKey: options.apiKey });
    this.model = options.model;
  }

  async generateAdvisory(context: PlanContext): Promise<PlanAdvisory> {
    const completion = await this.client.chat.completions.parse({
      model: this.model,
      messages: [
        { role: 'system', content: ADVISORY_SYSTEM_PROMPT },
        { role: 'user', content: buildAdvisoryUserPrompt(context) },
      ],
      response_format: zodResponseFormat(planAdvisorySchema, 'plan_advisory'),
    });

    const message = completion.choices[0]?.message;
    if (!message) {
      throw new Error('OpenAI returned no choices for the plan advisory request.');
    }
    if (message.refusal) {
      throw new Error(`OpenAI refused the plan advisory request: ${message.refusal}`);
    }
    if (!message.parsed) {
      throw new Error('OpenAI returned no parsed advisory content.');
    }
    return planAdvisorySchema.parse(message.parsed);
  }
}
