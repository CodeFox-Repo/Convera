export const OFFICIAL_MODELS = [
  "gpt-4o",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
  "anthropic/claude-3.5-sonnet-20240620",
  "anthropic/claude-3.5-sonnet:beta",
  "anthropic/claude-3.7-sonnet",
];

export const fetchOpenRouterModels = async (): Promise<string[]> => {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  const data = await res.json();
  // data.data is the array of models
  return data.data.map((m: { id: string }) => m.id);
};
