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

Peer dependency: `@playwright/test >= 1.40.0`

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

#### 1. `@SkipOnError` — декоратор для методов класса

```typescript
import { SkipOnError } from 'playwright-flakyzavr';

class LoginPage {
  @SkipOnError([/net::ERR_CONNECTION_REFUSED/, /Timeout/])
  async open(page: Page) {
    await page.goto('http://localhost:3000/login');
  }
}
```

#### 2. `withSkipOnError` — обертка для тест-функции

```typescript
import { test } from '@playwright/test';
import { withSkipOnError } from 'playwright-flakyzavr';

test('my test', withSkipOnError(
  [/net::ERR_CONNECTION_REFUSED/],
  async ({ page }) => {
    await page.goto('http://localhost:3000');
  },
));
```

#### 3. `skipOnError` — вызов внутри теста

```typescript
import { test } from '@playwright/test';
import { skipOnError } from 'playwright-flakyzavr';

test('my test', async ({ page }) => {
  await skipOnError([/net::ERR_CONNECTION_REFUSED/], async () => {
    await page.goto('http://localhost:3000');
  });
});
```

Во всех случаях: если ошибка совпадает с паттерном — тест помечается `-` (skipped), если не совпадает — падает как обычно.

## Локальная разработка

```bash
# Клонировать репозиторий
git clone https://github.com/MoscowQA/podcast.git
cd podcast

# Установить зависимости
npm install

# Сборка
npm run build

# Запуск тестов
npm test

# Тесты с покрытием
npm run test:coverage

# Линтинг
npm run lint

# Форматирование
npm run format
```

### Запуск примеров

```bash
# Основной пример (dry-run репортер)
npx playwright test --config example/playwright.config.ts

# Фильтрация исключений
npx playwright test --config example/playwright-filtered.config.ts

# skipOnError (декоратор + inline)
npx playwright test --config example/playwright-skip.config.ts
```

### Структура проекта

```
src/
  index.ts           — экспорты
  types.ts           — интерфейсы (FlakyzavrConfig и др.)
  reporter.ts        — Playwright Reporter
  jira-client.ts     — Jira REST API клиент
  messages.ts        — шаблоны сообщений EN/RU
  skip-on-error.ts   — skipOnError / withSkipOnError / @SkipOnError
tests/
  *.test.ts          — юнит-тесты (vitest)
  integration.test.ts — интеграционные тесты
example/
  *.spec.ts          — демо-тесты
  playwright*.config.ts — конфиги для примеров
```

## Лицензия

MIT
