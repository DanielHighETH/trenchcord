import type { KeywordPattern, KeywordMatchMode } from '../discord/types.js';

const regexCache = new Map<string, RegExp>();

function getCompiledRegex(pattern: string): RegExp | null {
  const cached = regexCache.get(pattern);
  if (cached) return cached;
  try {
    const re = new RegExp(pattern, 'i');
    regexCache.set(pattern, re);
    return re;
  } catch {
    return null;
  }
}

function resolveMode(kw: KeywordPattern): KeywordMatchMode {
  if (kw.matchMode) return kw.matchMode;
  return kw.isRegex ? 'regex' : 'includes';
}

export function matchKeywords(content: string, patterns: KeywordPattern[]): string[] {
  if (!content || patterns.length === 0) return [];

  const matched: string[] = [];
  const lowerContent = content.toLowerCase();

  for (const kw of patterns) {
    if (!kw.pattern) continue;
    const label = kw.label || kw.pattern;
    const mode = resolveMode(kw);

    switch (mode) {
      case 'regex': {
        const re = getCompiledRegex(kw.pattern);
        if (re?.test(content)) matched.push(label);
        break;
      }
      case 'exact': {
        const re = getCompiledRegex(`\\b${kw.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (re?.test(content)) matched.push(label);
        break;
      }
      case 'includes':
      default: {
        if (lowerContent.includes(kw.pattern.toLowerCase())) matched.push(label);
        break;
      }
    }
  }

  return matched;
}
