import { spawnSync } from 'node:child_process';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const HARNESSES = ['run.mjs', 'menu.mjs', 'syrup.mjs', 'foam.mjs', 'play2-touch.mjs', 'play2-region.mjs', 'play2-feedback.mjs', 'play3-guide.mjs', 'play3-aim.mjs', 'balance.mjs'];
const loaderPath = fileURLToPath(new URL('./loader.mjs', import.meta.url));
const results = [];

for (const name of HARNESSES) {
  const label = posix.join('test', name);
  const harnessPath = fileURLToPath(new URL(`./${name}`, import.meta.url));
  console.log(`\n──── ${label} ────`);
  const result = spawnSync(process.execPath, [
    '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
    '--import', loaderPath,
    harnessPath,
  ], { stdio: 'inherit' });
  const passed = result.status === 0;
  const detail = passed ? '' : result.signal
    ? `signal ${result.signal}`
    : result.error?.message || `exit ${result.status}`;
  results.push({ label, passed, detail });
}

console.log('\nSummary');
for (const result of results) {
  const detail = result.detail ? ` (${result.detail})` : '';
  console.log(`  ${result.passed ? 'PASS' : 'FAIL'} ${result.label}${detail}`);
}
const failures = results.filter(result => !result.passed).length;
console.log(`\n${results.length - failures} passed, ${failures} failed, ${results.length} total`);
process.exit(failures === 0 ? 0 : 1);
