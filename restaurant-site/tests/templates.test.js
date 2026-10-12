const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const root = path.join(__dirname, '..', 'views');
function findTemplates(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? findTemplates(fullPath) : entry.name.endsWith('.ejs') ? [fullPath] : [];
  });
}

test('all EJS templates compile without executing database code', () => {
  const templates = findTemplates(root);
  assert.ok(templates.length >= 20);
  for (const template of templates) {
    assert.doesNotThrow(() => ejs.compile(fs.readFileSync(template, 'utf8'), { filename: template }), template);
  }
});
