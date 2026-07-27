import type { RollDie, RollResult } from '../../types/combat';

type Token =
  | { type: 'number'; value: number }
  | { type: 'dice'; count: number; sides: number }
  | { type: 'plus' | 'minus' | 'lparen' | 'rparen' | 'eof' };

export class DiceExpressionError extends Error {}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const rest = input.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) { index += whitespace[0].length; continue; }
    const dice = rest.match(/^(\d*)[dD](\d+)/);
    if (dice) {
      const count = dice[1] ? Number(dice[1]) : 1;
      const sides = Number(dice[2]);
      if (count < 1 || count > 100 || sides < 2 || sides > 1000) {
        throw new DiceExpressionError('Dice must use 1–100 dice with 2–1000 sides.');
      }
      tokens.push({ type: 'dice', count, sides });
      index += dice[0].length;
      continue;
    }
    const number = rest.match(/^\d+(?:\.\d+)?/);
    if (number) {
      tokens.push({ type: 'number', value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const symbol = rest[0];
    if (symbol === '+') tokens.push({ type: 'plus' });
    else if (symbol === '-') tokens.push({ type: 'minus' });
    else if (symbol === '(') tokens.push({ type: 'lparen' });
    else if (symbol === ')') tokens.push({ type: 'rparen' });
    else throw new DiceExpressionError(`Unexpected character "${symbol}".`);
    index += 1;
  }
  tokens.push({ type: 'eof' });
  return tokens;
}

export interface RollOptions {
  mode?: 'normal' | 'advantage' | 'disadvantage';
  critical?: boolean;
  rng?: () => number;
}

export function rollExpression(expression: string, options: RollOptions = {}): RollResult {
  if (!expression.trim()) throw new DiceExpressionError('Enter a dice expression.');
  const tokens = tokenize(expression);
  const diceResults: RollDie[] = [];
  const mode = options.mode ?? 'normal';
  const critical = options.critical ?? false;
  const rng = options.rng ?? Math.random;
  let position = 0;
  let group = 0;
  let diceTotal = 0;

  const peek = () => tokens[position];
  const consume = () => tokens[position++];
  const rollOne = (sides: number) => Math.floor(Math.min(0.999999999, Math.max(0, rng())) * sides) + 1;

  const parseFactor = (): number => {
    const token = consume();
    if (token.type === 'number') return token.value;
    if (token.type === 'minus') return -parseFactor();
    if (token.type === 'plus') return parseFactor();
    if (token.type === 'lparen') {
      const value = parseSum();
      if (consume().type !== 'rparen') throw new DiceExpressionError('Missing closing parenthesis.');
      return value;
    }
    if (token.type === 'dice') {
      const currentGroup = group++;
      const count = token.count * (critical ? 2 : 1);
      let value = 0;
      if (token.sides === 20 && mode !== 'normal' && token.count === 1 && !critical) {
        const first = rollOne(20);
        const second = rollOne(20);
        const keepFirst = mode === 'advantage' ? first >= second : first <= second;
        diceResults.push({ sides: 20, value: first, kept: keepFirst, group: currentGroup });
        diceResults.push({ sides: 20, value: second, kept: !keepFirst, group: currentGroup });
        value = keepFirst ? first : second;
      } else {
        for (let i = 0; i < count; i += 1) {
          const rolled = rollOne(token.sides);
          diceResults.push({ sides: token.sides, value: rolled, kept: true, group: currentGroup });
          value += rolled;
        }
      }
      diceTotal += value;
      return value;
    }
    throw new DiceExpressionError('Expected a number, die, or parenthesized expression.');
  };

  const parseSum = (): number => {
    let value = parseFactor();
    while (peek().type === 'plus' || peek().type === 'minus') {
      const operator = consume().type;
      const right = parseFactor();
      value = operator === 'plus' ? value + right : value - right;
    }
    return value;
  };

  const total = parseSum();
  if (peek().type !== 'eof') throw new DiceExpressionError('Unexpected trailing input.');
  return {
    expression,
    normalizedExpression: expression.replace(/\s+/g, ' ').trim(),
    dice: diceResults,
    modifier: total - diceTotal,
    total,
    mode,
    critical,
  };
}

export function formatRoll(result: RollResult): string {
  const dice = result.dice
    .map((die) => `${die.kept ? '' : '~'}${die.value}`)
    .join(', ');
  const modifier = result.modifier
    ? ` ${result.modifier > 0 ? '+' : '−'} ${Math.abs(result.modifier)}`
    : '';
  return `[${dice}]${modifier} = ${result.total}`;
}
