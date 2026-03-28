import { describe, it, expect } from 'vitest';
import { renderTemplate, getLangSet, EN_REPORTING_LANG, RU_REPORTING_LANG } from '../src/messages.js';

describe('renderTemplate', () => {
  it('replaces single placeholder', () => {
    expect(renderTemplate('Hello {name}!', { name: 'World' })).toBe('Hello World!');
  });

  it('replaces multiple placeholders', () => {
    const result = renderTemplate('{a} and {b}', { a: '1', b: '2' });
    expect(result).toBe('1 and 2');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(renderTemplate('{known} {unknown}', { known: 'ok' })).toBe('ok {unknown}');
  });

  it('handles empty vars', () => {
    expect(renderTemplate('{a}', {})).toBe('{a}');
  });

  it('replaces same placeholder multiple times', () => {
    expect(renderTemplate('{x} {x}', { x: 'val' })).toBe('val val');
  });
});

describe('getLangSet', () => {
  it('returns EN lang set', () => {
    expect(getLangSet('en')).toBe(EN_REPORTING_LANG);
  });

  it('returns RU lang set', () => {
    expect(getLangSet('ru')).toBe(RU_REPORTING_LANG);
  });
});

describe('EN_REPORTING_LANG templates', () => {
  it('summaryTemplate contains projectName and testName', () => {
    const result = renderTemplate(EN_REPORTING_LANG.summaryTemplate, {
      projectName: 'MyProject',
      testName: 'login test',
    });
    expect(result).toContain('MyProject');
    expect(result).toContain('login test');
  });

  it('descriptionTemplate contains all expected placeholders rendered', () => {
    const result = renderTemplate(EN_REPORTING_LANG.descriptionTemplate, {
      testName: 'login test',
      testPath: 'tests/login.spec.ts',
      error: 'Element not found',
      traceback: 'at line 42',
      jobLink: 'https://ci/job/1',
      projectName: 'QA',
    });
    expect(result).toContain('login test');
    expect(result).toContain('tests/login.spec.ts');
    expect(result).toContain('Element not found');
    expect(result).toContain('at line 42');
    expect(result).toContain('https://ci/job/1');
  });

  it('commentTemplate renders failure count', () => {
    const result = renderTemplate(EN_REPORTING_LANG.commentTemplate, {
      error: 'Timeout',
      traceback: 'stack...',
      jobLink: 'https://ci/1',
      failureCount: '3',
    });
    expect(result).toContain('3');
    expect(result).toContain('Timeout');
  });
});

describe('RU_REPORTING_LANG templates', () => {
  it('summaryTemplate contains Russian text', () => {
    const result = renderTemplate(RU_REPORTING_LANG.summaryTemplate, {
      projectName: 'Проект',
      testName: 'тест логина',
    });
    expect(result).toContain('Flaky тест');
    expect(result).toContain('тест логина');
  });
});
