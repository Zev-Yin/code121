import OpenAI from "openai";

export function createProvider() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'missing-api-key',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  });
}
