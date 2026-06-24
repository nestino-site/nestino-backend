export const LLM_CLIENT = Symbol('LLM_CLIENT');

export interface LlmJsonRequest {
  system: string;
  user: string;
}

/**
 * Model-agnostic interface for LLM calls that must return JSON.
 * Swap the concrete binding (LLM_CLIENT token) to change provider or model
 * without touching any business logic.
 */
export interface LlmClient {
  /**
   * Send a chat completion request and return the raw JSON string from the model.
   * Implementations must configure `response_format: { type: 'json_object' }` (or
   * equivalent) to guarantee JSON output.
   */
  completeJson(request: LlmJsonRequest): Promise<string>;
}
