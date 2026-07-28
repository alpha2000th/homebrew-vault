import { describe, expect, it } from 'vitest';
import { DiceExpressionError, rollExpression } from './parser';

const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++] ?? 0;
};

describe('safe dice parser', () => {
  it('rolls a d20 without eval', () => {
    expect(rollExpression('1d20', { rng: () => .49 }).total).toBe(10);
  });

  it('supports multiple dice, modifiers, subtraction, flat values, and parentheses', () => {
    expect(rollExpression('2d8 + 5', { rng: sequence(0, .999) }).total).toBe(14);
    expect(rollExpression('8d10 + 6d10', { rng: () => 0 }).total).toBe(14);
    expect(rollExpression('(10 + 5) - 3').total).toBe(12);
    expect(rollExpression('42').total).toBe(42);
  });

  it('supports advantage and disadvantage with visible kept dice', () => {
    const advantage = rollExpression('1d20 + 3', { mode: 'advantage', rng: sequence(.1, .9) });
    expect(advantage.total).toBe(22);
    expect(advantage.dice.map((die) => die.kept)).toEqual([false, true]);
    const disadvantage = rollExpression('1d20', { mode: 'disadvantage', rng: sequence(.1, .9) });
    expect(disadvantage.total).toBe(3);
    expect(disadvantage.dice.map((die) => die.kept)).toEqual([true, false]);
  });

  it('doubles dice, not modifiers, on a critical roll', () => {
    expect(rollExpression('2d8 + 5', { critical: true, rng: () => 0 }).total).toBe(9);
  });

  it('rejects arbitrary JavaScript', () => {
    expect(() => rollExpression('globalThis.alert(1)')).toThrow(DiceExpressionError);
  });
});
