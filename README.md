# Telegram LLM bot (polling, stateless)

Простой Telegram-бот, который принимает **текстовые сообщения**, отправляет их в **локальную LLM** и возвращает ответ пользователю.

## Требования

- Node.js (рекомендуется 18+)
- Запущенная локальная модель через Ollama:

```bash
ollama pull qwen3:0.6b
ollama serve
```

## Запуск

Создайте файл `.env` рядом с `README.md`:

```bash
cp .env.example .env
```

Отредактируйте `.env`, установите `TELEGRAM_BOT_TOKEN`.

Запуск бота:

```bash
node src/index.js
```

## Структура кода (SRP/SOLID)

Каждый модуль делает одну вещь:

- `src/config/dotenv.js`: загрузка `.env` в `process.env` (без зависимостей)
- `src/config/config.js`: чтение/валидация env и сбор единого объекта `config`
- `src/infra/httpJsonClient.js`: низкоуровневый HTTP(S) клиент для JSON (таймауты, keep-alive)
- `src/telegram/telegramClient.js`: работа с Telegram Bot API (только транспорт/методы API)
- `src/llm/ollamaClient.js`: работа с Ollama (`/api/generate`) для выбранной модели
- `src/handlers/textMessageHandler.js`: бизнес-логика “взял текст → спросил LLM → ответил в Telegram”
- `src/telegram/telegramPoller.js`: polling-цикл `getUpdates`, backoff, управление `offset`, ограничение параллелизма
- `src/utils/*`: маленькие утилиты (`Semaphore`, `sleep`, `clampInt`)
- `src/index.js`: композиция зависимостей и запуск (тонкий entrypoint)

## Настройки (через env)

- `TELEGRAM_BOT_TOKEN`: 118117***********
- `OLLAMA_URL`: URL Ollama (по умолчанию `http://127.0.0.1:11434`)
- `OLLAMA_MODEL`: модель (по умолчанию `qwen3:0.6b`)
- `TELEGRAM_POLL_TIMEOUT_SEC`: long polling timeout (по умолчанию 30)
- `MAX_CONCURRENCY`: сколько запросов к LLM параллельно (по умолчанию 4)

## Этапы разработки

Использовался внутренний чат ИИ редактора Cursor. Рабочая программа написана с первого раза, без учёта замены в коде значений переменных окружения OLLAMA_MODEL и TELEGRAM_BOT_TOKEN
