import assert from 'node:assert/strict';
import { ErrorClassifierService } from './error-classifier.service';

function run(): void {
  const classifier = new ErrorClassifierService();

  assert.equal(
    classifier.classify(new Error('Imagen HTTP 400: paid plans. Please upgrade your account')),
    'PROVIDER_BILLING',
  );
  assert.equal(
    classifier.classify(new Error('OpenAI HTTP 429: insufficient_quota')),
    'PROVIDER_BILLING',
  );
  assert.equal(
    classifier.classify(new Error('Anthropic HTTP 400: credit balance too low')),
    'PROVIDER_BILLING',
  );
  assert.equal(classifier.classify(new Error('OpenAI HTTP 401: invalid api key')), 'PERMANENT');
  assert.equal(classifier.classify(new Error('OpenAI HTTP 429: rate limit')), 'TRANSIENT');

  assert.equal(
    classifier.inferProvider(new Error('Imagen HTTP 400: paid plans')),
    'google-imagen',
  );
  assert.equal(
    classifier.inferProvider(new Error('Gemini HTTP 400: quota exceeded')),
    'google-gemini',
  );
  assert.equal(
    classifier.inferProvider(new Error('OpenAI HTTP 402: payment required')),
    'openai',
  );

  console.log('error-classifier.service.spec.ts: all assertions passed');
}

run();
