const http = require('http');
const express = require('express');
const compression = require('compression');
jest.mock('../src/services/aiService', () => ({ generateSuggestionStream: jest.fn() }));
jest.mock('../src/config/logger', () => ({ error: jest.fn() }));
const ai = require('../src/services/aiService');
const { generateSuggestion } = require('../src/controllers/aiController');

test('AI text reaches the browser before generation finishes, even when gzip is accepted', async () => {
  let finishGeneration, completed = false;
  const gate = new Promise(resolve => { finishGeneration = resolve; });
  ai.generateSuggestionStream.mockImplementation(async (type, context, emit) => {
    emit('First visible words');
    await gate;
    completed = true;
    emit(' and the remaining text');
  });
  const app = express();
  app.use(compression()); app.use(express.json());
  app.post('/suggest', generateSuggestion);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  let request, response, timeout;
  try {
    const result = await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('AI stream was buffered')), 2000);
      request = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/suggest', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip' } }, res => {
        response = res;
        let body = '', sawEarlyText = false;
        res.on('data', data => {
          body += data.toString();
          if (body.includes('First visible words') && !completed) {
            sawEarlyText = true;
            finishGeneration();
          }
        });
        res.on('end', () => resolve({ headers: res.headers, body, sawEarlyText }));
        res.on('error', reject);
      });
      request.on('error', reject);
      request.end(JSON.stringify({ type: 'summary', context: { skills: ['Testing'] }, stream: true }));
    });
    expect(result.sawEarlyText).toBe(true);
    expect(result.headers['content-encoding']).toBeUndefined();
    expect(result.headers['x-accel-buffering']).toBe('no');
    expect(result.body).toContain('data: [DONE]');
  } finally {
    clearTimeout(timeout); finishGeneration();
    if (response) response.destroy();
    if (request) request.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
