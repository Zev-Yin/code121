import OpenAI from "openai";

export const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    baseURL: 'https://api.openai.com/v1'
  },
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-opus-4-5',
    baseURL: 'https://api.anthropic.com/v1'
  },
  gemini: {
    name: 'Gemini',
    defaultModel: 'gemini-2.0-flash',
    baseURL: 'https://generativelanguage.googleapis.com/v1'
  },
  custom: {
    name: 'Custom (OpenAI Compatible)',
    defaultModel: 'z-ai/glm-4.5-air:free',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  }
};

export const MODEL_CAPS = {
  'claude-*': { parallelTools: true },
  'gpt-4*': { parallelTools: true },
  'gpt-3.5*': { parallelTools: true },
  'gemini-*': { parallelTools: true },
  'glm-*': { parallelTools: false },
  'qwen-*': { parallelTools: true },
  'default': { parallelTools: true }
};

export function detectProvider(model) {
  const modelLower = model.toLowerCase();
  
  if (modelLower.includes('claude')) return 'anthropic';
  if (modelLower.includes('gemini')) return 'gemini';
  if (modelLower.includes('gpt') || modelLower.includes('openai')) return 'openai';
  
  return 'custom';
}

export function getCapabilities(model) {
  for (const [pattern, caps] of Object.entries(MODEL_CAPS)) {
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$', 'i');
    if (regex.test(model)) {
      return caps;
    }
  }
  return MODEL_CAPS.default;
}

export class ProviderFactory {
  constructor(config = {}) {
    this.config = config;
  }

  createClient() {
    const providerType = this.getProviderType();
    const provider = PROVIDERS[providerType];
    const apiKey = this.getApiKey(providerType);
    const baseURL = this.getBaseURL(providerType);

    if (providerType === 'anthropic') {
      return this.createAnthropicClient(apiKey, baseURL);
    }

    return new OpenAI({
      apiKey,
      baseURL,
      ...(this.config.defaultHeaders && { defaultHeaders: this.config.defaultHeaders })
    });
  }

  getProviderType() {
    if (this.config.provider) {
      return this.config.provider;
    }
    
    const model = this.config.model || process.env.OPENAI_MODEL_NAME || 'z-ai/glm-4.5-air:free';
    return detectProvider(model);
  }

  getApiKey(providerType) {
    const envKeys = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GOOGLE_API_KEY',
      custom: 'OPENAI_API_KEY'
    };
    
    return process.env[envKeys[providerType]] || 
           process.env.OPENAI_API_KEY || 
           'missing-api-key';
  }

  getBaseURL(providerType) {
    const envURLs = {
      openai: 'OPENAI_BASE_URL',
      anthropic: 'ANTHROPIC_BASE_URL',
      gemini: 'GOOGLE_BASE_URL',
      custom: 'OPENAI_BASE_URL'
    };
    
    return process.env[envURLs[providerType]] || PROVIDERS[providerType].baseURL;
  }

  createAnthropicClient(apiKey, baseURL) {
    return new OpenAI({
      apiKey,
      baseURL: baseURL + '/messages',
      defaultHeaders: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });
  }

  static fromConfig(config) {
    return new ProviderFactory(config);
  }
}

export function createProvider(config = {}) {
  const factory = ProviderFactory.fromConfig(config);
  return factory.createClient();
}