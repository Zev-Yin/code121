import { Agent } from './src/agent.js';
import { createUI } from './src/ui.js';

const DEBUG = process.env.DEBUG === 'true';
const MODEL = process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini';

const agent = new Agent({ debug: DEBUG, model: MODEL });
const ui = await createUI(agent);
ui.start();
