import type { Measurement, MeasurementKind } from '../../api/client';

const kindLabels: Readonly<Record<MeasurementKind, string>> = {
  reps: '回数',
  weight: '重量',
  time: '時間',
};

export const kindLabel = (kind: MeasurementKind): string => kindLabels[kind];

/** "回数 (必須)・重量 (任意)". */
export const measurementSummary = (measurements: readonly Measurement[]): string =>
  measurements.map((m) => `${kindLabel(m.kind)} (${m.required ? '必須' : '任意'})`).join('・');
