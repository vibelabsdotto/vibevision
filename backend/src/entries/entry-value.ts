import { normalizeAmount } from '../common/util';
import type { ExecutionStyle, TacticPlan } from '../tactics/plan';

/**
 * Entry-value guard matrix — port merging core resolveTacticEntryValue
 * (client guard) and the hooks' getEntryValue (server enforcement).
 * Returns the storable value; throws on rule violations.
 */
export function resolveTacticEntryValue(
  plan: TacticPlan,
  style: ExecutionStyle,
  value?: number,
  completed = false,
): number {
  if (style === 'occurrence') {
    const effective =
      completed && (value === undefined || value === 0) ? 1 : (value ?? 1);
    if (!Number.isInteger(effective) || effective <= 0) {
      throw new Error(
        `Occurrence entry value must be a positive whole number (got ${String(value)})`,
      );
    }
    return effective;
  }
  if (plan.trackingType === 'duration') {
    if (value === undefined || value === null) {
      throw new Error('duration tactics need a value (minutes)');
    }
    const v = normalizeAmount(value);
    if (v === 0) throw new Error('Invalid tactic entry value');
    return v;
  }
  if (plan.trackingType === 'quantity') {
    const v = normalizeAmount(value ?? 1);
    if (v === 0) throw new Error('Invalid tactic entry value');
    return v;
  }
  // boolean (toggle): the flag/counting decides, value is informational.
  return normalizeAmount(value ?? 0);
}
