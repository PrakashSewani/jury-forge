import { REVIEWER_TEMPLATES } from '@jury-forge/shared';
import { describe, expect, it } from 'vitest';

const EXPECTED: [string, string][] = [
  ['security', 'Security'],
  ['architecture', 'Architecture'],
  ['backend', 'Backend'],
  ['frontend', 'Frontend'],
  ['performance', 'Performance'],
  ['testing', 'Testing'],
  ['documentation', 'Documentation'],
];

describe('REVIEWER_TEMPLATES', () => {
  it('has exactly the seven built-in roles, keys and names in order', () => {
    expect(REVIEWER_TEMPLATES.map((template) => [template.key, template.name])).toEqual(EXPECTED);
  });

  it('uses unique keys', () => {
    const keys = REVIEWER_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every template a non-empty summary, instructions and rules', () => {
    for (const template of REVIEWER_TEMPLATES) {
      expect(template.summary.trim().length).toBeGreaterThan(0);
      expect(template.instructions.trim().length).toBeGreaterThan(0);
      expect(template.rules.trim().length).toBeGreaterThan(0);
    }
  });

  it('names no model or provider in its instructions or rules', () => {
    for (const template of REVIEWER_TEMPLATES) {
      const text = `${template.instructions}\n${template.rules}`;
      expect(text).not.toMatch(/gpt|claude|openai|anthropic|api\.|https?:\/\//i);
    }
  });
});
