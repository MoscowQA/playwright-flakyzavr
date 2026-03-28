# playwright-flakyzavr

Playwright-репортер, который автоматически создает тикеты в Jira при падении тестов.
Вдохновлен Python-плагином [flakyzavr](https://github.com/ko10ok/flakyzavr).

## Возможности

- Автоматическое создание Jira-тикетов при падении тестов
- Поиск существующих тикетов (дедупликация) — если тикет уже есть, добавляет комментарий
- Фильтрация ошибок по regex-паттернам (не создавать тикеты для определенных ошибок)
- Dry-run режим — логирование без создания тикетов
- Шаблоны сообщений на русском и английском
- Token-based аутентификация в Jira
- Интеграция с CI/CD — ссылка на джоб в тикете
- `skipOnError` — пометка тестов как skipped вместо failed при определенных ошибках

## Установка

```bash
npm install playwright-flakyzavr
```

## Использование

### Репортер

Добавь репортер в `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['playwright-flakyzavr', {
      jiraServer: 'https://jira.example.com',
      jiraToken: process.env.JIRA_TOKEN,
      jiraProject: 'QA',
      jiraLabels: ['flaky', 'autotest'],
      jiraComponents: ['UI'],
      jobPath: 'https://ci.example.com/jobs/{job_id}',
      reportingLang: 'ru',
    }],
  ],
});
```

### Конфигурация

| Параметр | Обязательный | По умолчанию | Описание |
|---|---|---|---|
| `jiraServer` | да | — | URL Jira-сервера |
| `jiraToken` | да | — | API-токен для аутентификации |
| `jiraProject` | да | — | Ключ проекта в Jira (например `QA`) |
| `jiraLabels` | нет | `['flaky']` | Метки для создаваемых тикетов |
| `jiraComponents` | нет | — | Компоненты Jira |
| `jiraIssueTypeId` | нет | `'Bug'` | Тип тикета |
| `jiraSearchStatuses` | нет | `['Open', 'In Progress', 'Reopened']` | Статусы для поиска существующих тикетов |
| `jiraAdditionalData` | нет | — | Дополнительные поля Jira |
| `reportEnabled` | нет | `true` | Включить/выключить репортер |
| `dryRun` | нет | `false` | Режим без создания тикетов (только логи) |
| `reportProjectName` | нет | `jiraProject` | Имя проекта в отчетах |
| `jobPath` | нет | — | Шаблон URL джоба CI/CD. Плейсхолдер `{job_id}` подставляется из `CI_JOB_ID`, `BUILD_ID` или `GITHUB_RUN_ID` |
| `exceptions` | нет | — | Regex-паттерны ошибок, для которых НЕ создавать тикеты |
| `reportingLang` | нет | `'en'` | Язык шаблонов: `'en'` или `'ru'` |

### skipOnError

Три способа пометить тест как skipped при определенных ошибках:

1. `@SkipOnError` — декоратор для методов класса
2. `withSkipOnError` — обертка для тест-функции
3. `skipOnError` — вызов внутри теста

Если ошибка совпадает с паттерном — тест помечается `-` (skipped), если не совпадает — падает как обычно.

Примеры использования: [example/skip.spec.ts](example/skip.spec.ts)

## Лицензия

MIT
