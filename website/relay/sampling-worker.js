import { createPractice, sampleCompatible } from './core.js';

self.addEventListener('message', ({ data }) => {
  const { id, command, payload } = data;
  try {
    const result = command === 'deal' ? createPractice(payload)
      : command === 'sample' ? sampleCompatible(payload.session, payload.options)
        : (() => { throw new Error('Unknown sampling command'); })();
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
});
