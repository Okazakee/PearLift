import type { WeightUnit } from '@/types';
import { roundToPrecision } from '@/utils/math';

const KG_PER_LB = 0.45359237;

export function kgToLb(valueKg: number): number {
  return valueKg / KG_PER_LB;
}

export function lbToKg(valueLb: number): number {
  return valueLb * KG_PER_LB;
}

export function roundToIncrement(value: number, increment: number): number {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(increment) ||
    increment <= 0
  ) {
    return value;
  }
  return Math.round(value / increment) * increment;
}

export function toDisplayWeight(valueKg: number, unit: WeightUnit): number {
  if (unit === 'lb') {
    return kgToLb(valueKg);
  }
  return valueKg;
}

export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  if (unit === 'lb') {
    return lbToKg(value);
  }
  return value;
}

export function getWeightStep(displayWeight: number, unit: WeightUnit): number {
  if (unit === 'lb') {
    return displayWeight >= 45 ? 5 : 2.5;
  }
  return displayWeight >= 20 ? 2.5 : 1;
}

export function formatWeight(displayWeight: number, unit: WeightUnit): string {
  const rounded =
    unit === 'lb'
      ? roundToPrecision(displayWeight, 1)
      : roundToPrecision(displayWeight, 1);
  const asInt = Math.round(rounded);
  if (Math.abs(rounded - asInt) < 1e-6) {
    return String(asInt);
  }
  return rounded.toFixed(1).replace(/\.0$/, '');
}

export function formatWeightUnit(unit: WeightUnit): string {
  return unit === 'lb' ? 'lb' : 'kg';
}
