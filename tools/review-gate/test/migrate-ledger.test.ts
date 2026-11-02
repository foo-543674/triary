import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertLedger, migrateLedger } from '../src/migrate-ledger.ts';

const finding = (id: string, status: string) => ({
  id, severity: 'critical', status, paths: ['a', 'b'], reviewedDiffHash: 'old',
  basis: 'rule\twith\nlines\rhere', evidence: 'evidence',
  origin: { kind: 'caused_by_fix', confidence: 'confirmed', causedBy: 'F0' },
  history: [{ at: 'then', diffHash: 'old', status: 'open', note: 'initial note' },
    { at: 'later', diffHash: 'middle', status: 'fixed_unverified' },
    { at: 'now', diffHash: 'new', status, note: 'last history note' }],
});
const source = Buffer.from(JSON.stringify({ version: 1,
  rounds: [{ scope: 'commit', diffHash: 'new', outputOk: true, reviewer: 'reviewer', reviewedAt: 'now' }],
  findings: [finding('F1', 'open'), { ...finding('F2', 'resolved'), paths: [], evidence: '', resolution: 'fixed' },
    { ...finding('F3', 'escalated'), decisionRef: '#42', resolution: 'decision needed' }],
}));

test('preserves rounds, every history entry and current finding state', () => {
  const lines = convertLedger(source).trimEnd().split('\n');
  assert.equal(lines[0], `# migrated from ledger.json ${source.byteLength} 3`);
  assert.equal(lines[1], 'round\tcommit\tnew\ttrue\treviewer\tnow');
  assert.equal(lines.length, 11);
  assert.equal(lines[4], 'finding\tF1\tcritical\topen\t-\tnew\tnow\ta,b\trule with lines here\tevidence\t-\tcaused_by_fix/confirmed/F0');
  assert.equal(lines[7]?.split('\t')[3], 'resolved');
  assert.equal(lines[7]?.split('\t')[7], '-');
  assert.equal(lines[7]?.split('\t')[9], '-');
  assert.equal(lines[10]?.split('\t')[4], '#42');
  assert.equal(lines[10]?.split('\t')[10], 'decision needed');
  assert.deepEqual(lines.slice(8).map(line => line.split('\t')[10]), ['initial note', '-', 'decision needed']);
  assert.deepEqual(lines.slice(8).map(line => line.split('\t')[9]), ['evidence', 'evidence', 'evidence']);
});

test('migration keeps JSON and comments and refuses an already migrated log', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ledger-migrate-'));
  try {
    writeFileSync(join(directory, 'ledger.json'), source);
    writeFileSync(join(directory, 'ledger.tsv'), '# empty log\n');
    migrateLedger(directory);
    const expected = `${convertLedger(source)}# empty log\n`;
    assert.equal(readFileSync(join(directory, 'ledger.tsv'), 'utf8'), expected);
    assert.deepEqual(readFileSync(join(directory, 'ledger.json')), source);
    assert.throws(() => migrateLedger(directory), /already migrated/);
    assert.equal(readFileSync(join(directory, 'ledger.tsv'), 'utf8'), expected);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

const gatePath = fileURLToPath(new URL('../gate.sh', import.meta.url));
const migrationPath = fileURLToPath(new URL('../src/migrate-ledger.ts', import.meta.url));
const existingLog = '# existing comment\r\nround\tcommit\texisting\ttrue\treviewer\tnow\r\n'
  + 'finding\tF1\timportant\topen\t-\texisting\tnow\ta\trule\tevidence\t-\tunknown/unknown\n# trailing comment';

for (const collision of [false, true]) {
  test(collision ? 'ID collision exits 2 without changing either ledger' : 'migrated legacy and existing findings are readable by the gate', () => {
    const repo = mkdtempSync(join(tmpdir(), 'ledger-migrate-repo-'));
    try {
      execFileSync('git', ['init', '-q', repo]);
      execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com',
        '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-qm', 'Initial commit'], { cwd: repo });
      const directory = join(repo, '.git', 'review-ledger');
      mkdirSync(directory);
      const legacy = Buffer.from(JSON.stringify({ version: 1, rounds: [],
        findings: [finding(collision ? 'F1' : 'R114', 'open'), finding('R1', 'resolved')],
      }));
      const target = join(directory, 'ledger.tsv');
      writeFileSync(join(directory, 'ledger.json'), legacy);
      writeFileSync(target, existingLog);
      if (collision) {
        assert.throws(() => migrateLedger(directory), /ID collision: F1/);
        const result = spawnSync(process.execPath, [migrationPath], { cwd: repo, encoding: 'utf8' });
        assert.equal(result.status, 2, result.stderr);
        assert.match(result.stderr, /ID collision: F1/);
        assert.deepEqual(readFileSync(target), Buffer.from(existingLog));
      } else {
        migrateLedger(directory);
        assert.deepEqual(readFileSync(target), Buffer.concat([Buffer.from(convertLedger(legacy)), Buffer.from(existingLog)]));
        const result = spawnSync('sh', [gatePath, 'show', '--all'], { cwd: repo, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        for (const id of ['R1', 'R114', 'F1']) assert.match(result.stdout, new RegExp(`\\b${id}\\b`));
        const migrated = readFileSync(target);
        const repeated = spawnSync(process.execPath, [migrationPath], { cwd: repo, encoding: 'utf8' });
        assert.equal(repeated.status, 2, repeated.stderr);
        assert.match(repeated.stderr, /already migrated/);
        assert.deepEqual(readFileSync(target), migrated);
      }
      assert.deepEqual(readFileSync(join(directory, 'ledger.json')), legacy);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  });
}
