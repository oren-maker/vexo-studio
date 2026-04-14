export type JobStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

export interface ProviderAdapter {
  validateConnection(): Promise<boolean>;
  estimateCost(payload: unknown): Promise<number>;
  submitJob(payload: unknown): Promise<string>;
  getJobStatus(jobId: string): Promise<JobStatus>;
  fetchResult(jobId: string): Promise<unknown>;
  cancelJob(jobId: string): Promise<void>;
  handleWebhook?(payload: unknown, signature: string): Promise<void>;
}

class StubAdapter implements ProviderAdapter {
  constructor(private readonly name: string) {}
  async validateConnection() { return true; }
  async estimateCost() { return 0; }
  async submitJob() { return `${this.name}-stub-${Date.now()}`; }
  async getJobStatus() { return "DONE" as const; }
  async fetchResult() { return { stub: true, provider: this.name }; }
  async cancelJob() { return; }
}

const REGISTRY: Record<string, ProviderAdapter> = {
  fal:         new StubAdapter("fal"),
  elevenlabs:  new StubAdapter("elevenlabs"),
  suno:        new StubAdapter("suno"),
  "openai-tts":new StubAdapter("openai-tts"),
  youtube:     new StubAdapter("youtube"),
  runwayml:    new StubAdapter("runwayml"),
};

export function getAdapter(name: string): ProviderAdapter {
  const a = REGISTRY[name.toLowerCase()];
  if (!a) throw new Error(`unknown provider adapter: ${name}`);
  return a;
}

export const PROVIDER_NAMES = Object.keys(REGISTRY);
