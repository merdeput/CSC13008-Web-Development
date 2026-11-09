const assert = require('node:assert/strict');
const test = require('node:test');
const { validPassword } = require('../../shared/auth/policy');

test('shared password policy requires length, uppercase, decimal digit, and special character', () => {
  assert.equal(validPassword('Twelve characters!4'), true);
  assert.equal(validPassword('Ábcdefghij١!'), true, 'Unicode uppercase letters and decimal digits are supported');
  assert.equal(validPassword('twelve characters!4'), false, 'an uppercase letter is required');
  assert.equal(validPassword('Twelve characters!!'), false, 'a number is required');
  assert.equal(validPassword('Twelve characters44'), false, 'a special character is required');
  assert.equal(validPassword('Aa1!short'), false, 'the existing 12-character minimum remains');
});

test('shared password policy keeps the 128-byte UTF-8 maximum', () => {
  assert.equal(validPassword(`${'😀'.repeat(31)}A1!`), true);
  assert.equal(validPassword(`${'😀'.repeat(32)}A1!`), false);
});
