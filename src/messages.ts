import { ReportingLangSet, ReportingLangKey } from './types';

export const EN_REPORTING_LANG: ReportingLangSet = {
  exceptionFiltered: '[flakyzavr] Skipped (exception filtered): {testName}',
  jiraUnavailable: '[flakyzavr] Jira is unavailable: {error}',
  issueExists: '[flakyzavr] Existing issue found: {issueKey} for test: {testName}',
  issueCreated: '[flakyzavr] Created new issue: {issueKey} for test: {testName}',
  dryRun: '[flakyzavr] [DRY RUN] Would create issue for test: {testName}',
  summaryTemplate: '[{projectName}] Flaky test: {testName}',
  descriptionTemplate:
    `h3. Flaky test detected\n\n` +
    `*Test:* {testName}\n` +
    `*File:* {testPath}\n` +
    `*Project:* {projectName}\n\n` +
    `h3. Error\n` +
    `{noformat}{error}{noformat}\n\n` +
    `h3. Stack trace\n` +
    `{noformat}{traceback}{noformat}\n\n` +
    `h3. CI/CD\n` +
    `[Job link|{jobLink}]\n`,
  commentTemplate:
    `h3. Test failed again\n\n` +
    `*Failure #:* {failureCount}\n\n` +
    `h3. Error\n` +
    `{noformat}{error}{noformat}\n\n` +
    `h3. Stack trace\n` +
    `{noformat}{traceback}{noformat}\n\n` +
    `[Job link|{jobLink}]\n`,
};

export const RU_REPORTING_LANG: ReportingLangSet = {
  exceptionFiltered: '[flakyzavr] Пропущен (ошибка отфильтрована): {testName}',
  jiraUnavailable: '[flakyzavr] Jira недоступна: {error}',
  issueExists: '[flakyzavr] Найден существующий тикет: {issueKey} для теста: {testName}',
  issueCreated: '[flakyzavr] Создан новый тикет: {issueKey} для теста: {testName}',
  dryRun: '[flakyzavr] [DRY RUN] Будет создан тикет для теста: {testName}',
  summaryTemplate: '[{projectName}] Flaky тест: {testName}',
  descriptionTemplate:
    `h3. Обнаружен flaky тест\n\n` +
    `*Тест:* {testName}\n` +
    `*Файл:* {testPath}\n` +
    `*Проект:* {projectName}\n\n` +
    `h3. Ошибка\n` +
    `{noformat}{error}{noformat}\n\n` +
    `h3. Стек вызовов\n` +
    `{noformat}{traceback}{noformat}\n\n` +
    `h3. CI/CD\n` +
    `[Ссылка на джоб|{jobLink}]\n`,
  commentTemplate:
    `h3. Тест упал снова\n\n` +
    `*Падение #:* {failureCount}\n\n` +
    `h3. Ошибка\n` +
    `{noformat}{error}{noformat}\n\n` +
    `h3. Стек вызовов\n` +
    `{noformat}{traceback}{noformat}\n\n` +
    `[Ссылка на джоб|{jobLink}]\n`,
};

const LANG_MAP: Record<ReportingLangKey, ReportingLangSet> = {
  en: EN_REPORTING_LANG,
  ru: RU_REPORTING_LANG,
};

export function getLangSet(lang: ReportingLangKey): ReportingLangSet {
  return LANG_MAP[lang];
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    return key in vars ? vars[key] : match;
  });
}
