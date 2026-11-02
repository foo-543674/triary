// One-time conversion of the legacy ledger; never changes the source JSON.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

type HistoryEntry = { at: string; diffHash: string; status: string; note?: string };
type Finding = {
  id: string; severity: string; status: string; decisionRef?: string;
  resolution?: string; evidence: string; basis: string; paths: string[];
  reviewedDiffHash: string; history: HistoryEntry[];
  origin: { kind: string; confidence: string; causedBy?: string };
};
type Ledger = {
  version: 1; findings: Finding[];
  rounds: { scope: string; diffHash: string; outputOk: boolean; reviewer: string; reviewedAt: string }[];
};
const field = (value: string | undefined): string => value?.replace(/[\t\n\r]+/g, ' ') || '-';
const row = (values: (string | undefined)[]): string => values.map(field).join('\t');
const requireValue = (valid: boolean): void => {
  if (!valid) throw new Error('Invalid legacy ledger; source left unchanged');
};

export function convertLedger(source: Buffer): string {
  const ledger = JSON.parse(source.toString('utf8')) as Ledger;
  requireValue(ledger.version === 1 && Array.isArray(ledger.findings) && Array.isArray(ledger.rounds));
  const lines = [`# migrated from ledger.json ${source.byteLength} ${ledger.findings.length}`];
  for (const round of ledger.rounds) {
    requireValue(['commit', 'push'].includes(round.scope) && typeof round.outputOk === 'boolean');
    lines.push(row(['round', round.scope, round.diffHash, String(round.outputOk), round.reviewer, round.reviewedAt]));
  }
  for (const finding of ledger.findings) {
    requireValue(['critical', 'important', 'minor'].includes(finding.severity));
    requireValue(Array.isArray(finding.history) && finding.history.length > 0);
    requireValue(finding.history.at(-1)?.status === finding.status);
    for (const [index, entry] of finding.history.entries()) {
      requireValue(['open', 'fixed_unverified', 'resolved', 'rejected', 'deferred', 'escalated'].includes(entry.status));
      lines.push(row(['finding', finding.id, finding.severity, entry.status, finding.decisionRef,
        entry.diffHash, entry.at, finding.paths.join(','), finding.basis, finding.evidence,
        index === finding.history.length - 1 ? finding.resolution : entry.note,
        [finding.origin.kind, finding.origin.confidence, finding.origin.causedBy].filter(Boolean).join('/')]));
    }
  }
  return `${lines.join('\n')}\n`;
}

export function migrateLedger(directory: string): void {
  const target = join(directory, 'ledger.tsv');
  const existing = existsSync(target) ? readFileSync(target) : Buffer.alloc(0);
  const existingLines = existing.toString('utf8').split(/\r?\n/);
  if (existingLines[0]?.startsWith('# migrated from ledger.json ')) {
    throw new Error('ledger.tsv is already migrated; refusing to migrate again');
  }
  const output = convertLedger(readFileSync(join(directory, 'ledger.json')));
  const convertedIds = new Set(output.split('\n')
    .filter(line => line.startsWith('finding\t')).map(line => line.split('\t')[1]));
  for (const line of existingLines) {
    const [kind, id] = line.split('\t');
    if (kind === 'finding' && convertedIds.has(id)) {
      throw new Error(`Finding ID collision: ${id}; ledger.tsv left unchanged`);
    }
  }
  const temporary = `${target}.migrate.${process.pid}`;
  try {
    writeFileSync(temporary, Buffer.concat([Buffer.from(output), existing]), { flag: 'wx' });
    renameSync(temporary, target);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
    migrateLedger(resolve(common, 'review-ledger'));
    console.log('Review ledger migrated. Legacy JSON retained.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
