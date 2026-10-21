import { sampleCompatible } from './core.js';
import { createTrainingPractice } from './practice.js';

self.addEventListener('message', ({ data }) => {
  const { id, command, payload } = data;
  try {
    if (command === 'sample' && payload.session.practiceRole === 'teller') {
      throw new Error('Compatible-hand contract assessment is available in asker practice.');
    }
    const result = command === 'deal' ? createTrainingPractice(payload)
      : command === 'sample' ? sampleCompatible(payload.session, payload.options)
        : (() => { throw new Error('Unknown sampling command'); })();
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
});
