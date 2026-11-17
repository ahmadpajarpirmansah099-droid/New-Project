'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const frontendFiles = [
  path.join(rootDir, 'index.html'),
  ...collectJavaScriptFiles(path.join(rootDir, 'assets/js'))
];

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScriptFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

function hasServiceRoleJwt(source) {
  const jwtPattern = /\b(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g;
  for (const match of source.matchAll(jwtPattern)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1].split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') return true;
    } catch {
      // Ignore strings that only resemble JWTs but are not valid encoded payloads.
    }
  }
  return false;
}

test('browser source does not contain privileged credentials', () => {
  const forbiddenPatterns = [
    /\bsb_secret_[A-Za-z0-9_-]{10,}\b/i,
    /\bSUPABASE_SERVICE_ROLE_KEY\b/,
    /\bSUPABASE_SECRET_KEY\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bpostgres(?:ql)?:\/\/[^'"\s<>]+/i,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/
  ];
  const findings = [];

  for (const filePath of frontendFiles) {
    const source = fs.readFileSync(filePath, 'utf8');
    const relativePath = path.relative(rootDir, filePath);
    if (forbiddenPatterns.some((pattern) => pattern.test(source))) {
      findings.push(relativePath);
    }
    if (hasServiceRoleJwt(source)) findings.push(relativePath + ' (service-role JWT)');
  }

  assert.deepEqual(findings, [], 'Privileged credentials must never be included in browser source.');
});

test('Supabase browser client uses a publishable key', () => {
  const authSource = fs.readFileSync(path.join(rootDir, 'assets/js/auth.js'), 'utf8');
  const keyMatch = authSource.match(/const SUPABASE_PUBLISHABLE_KEY\s*=\s*(['"])([^'"]+)\1/);
  assert.ok(keyMatch, 'A Supabase publishable key must be configured in auth.js.');
  assert.match(keyMatch[2], /^sb_publishable_/, 'The browser must use a publishable key, not a secret key.');
});
