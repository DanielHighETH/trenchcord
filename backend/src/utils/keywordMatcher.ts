import type { KeywordPattern } from '../discord/types.js';

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

export function matchKeywords(content: string, patterns: KeywordPattern[]): string[] {
  if (!content || patterns.length === 0) return [];

  const matched: string[] = [];
  const lowerContent = content.toLowerCase();

  for (const kw of patterns) {
    if (!kw.pattern) continue;
    const label = kw.label || kw.pattern;

    if (kw.isRegex) {
      const re = getCompiledRegex(kw.pattern);
      if (re?.test(content)) {
        matched.push(label);
      }
    } else {
      if (lowerContent.includes(kw.pattern.toLowerCase())) {
        matched.push(label);
      }
    }
  }

  return matched;
}
