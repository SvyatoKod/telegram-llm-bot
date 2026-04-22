# Telegram LLM bot (polling, stateless)

Telegram-бот: принимает **текстовые сообщения**, ведёт историю диалога в памяти, отправляет её в **локальную LLM** (Ollama) и возвращает ответ пользователю. Внутри — простая in-memory событийная шина (`EventEmitter`) для слабой связности модулей.

## Что делает

- long-polling `getUpdates` в Telegram Bot API
- идентификация пользователя по `msg.from.id`
- хранение истории диалога отдельно для каждого пользователя (только в памяти)
- автоматическое сжатие истории в «резюме» при превышении порога
- команда `/clear` — очистка истории
- подробное логирование исходящего в LLM контекста (`logs/llm-context-YYYY-MM-DD.log`)

## Требования

- Node.js 18+
- Запущенная модель через Ollama:

```bash
ollama pull qwen3:0.6b
ollama serve
```

## Запуск

```bash
cp .env.example .env   # вписать TELEGRAM_BOT_TOKEN
node src/index.js
```

## Структура проекта

```
src/
├── index.js                   # composition root: грузит конфиг, создаёт шину и модули
├── config/
│   ├── dotenv.js              # ручная загрузка .env
│   └── config.js              # чтение/валидация env → единый объект config
├── infra/
│   ├── httpJsonClient.js      # HTTP(S)-клиент JSON (таймауты, keep-alive)
│   ├── contextLog.js          # append-only JSONL-лог контекста LLM
│   ├── eventBus.js            # обёртка над Node EventEmitter (safe emit)
│   └── events.js              # константы имён событий
├── utils/                     # Semaphore, sleep, clampInt
└── module/
    ├── orchestrator/          # Telegram-клиент, poller, MessageOrchestrator
    ├── chat/                  # ChatService + OllamaClient (/api/chat)
    ├── history/               # in-memory хранилище истории по userId
    └── users/                 # реестр пользователей из Telegram
```

## Схема взаимодействия

```
┌──────────┐  getUpdates   ┌───────────────┐   msg   ┌────────────────────────┐
│ Telegram │ ────────────▶ │ TelegramPoller│ ──────▶ │  MessageOrchestrator   │
└──────────┘               └───────────────┘         └──────────┬─────────────┘
       ▲                                                        │
       │        sendMessage(answer)                             │
       └────────────────────────────────────────────────────────┘
                                                                │
                                        ┌───────────────────────┼───────────────────────┐
                                        ▼                       ▼                       ▼
                                   users.identify         emit MessageReceived   chat.generateAnswer
                                   └─emit UserCreated       └─history сохраняет    └─emit ResponseGenerated
                                                              user msg               └─history сохраняет
                                                                                       assistant msg
```

Подробности потока и роли каждого события — в [`docs/architecture.md`](docs/architecture.md).

## Событийная модель (кратко)

Единый in-memory `EventEmitter` (`src/infra/eventBus.js`) публикует три события:

| Событие | Кто эмитит | Кто слушает | Payload |
|---|---|---|---|
| `UserCreated` | `users` (при создании нового пользователя) | — (сейчас только лог в `index.js`) | `{ userId, telegramId, username, firstName, lastName, createdAt }` |
| `MessageReceived` | `orchestrator` (при входящем текстовом сообщении) | `history` — сохраняет user-сообщение | `{ userId, chatId, messageId, content }` |
| `ResponseGenerated` | `chat` (после ответа LLM) | `history` — сохраняет assistant-сообщение | `{ userId, chatId, replyToMessageId, answer, messagesSent }` |

Запись сообщений в `history` идёт **только через шину**. Чтение (`getAll`, `replaceAll` для суммаризации, `clear` для `/clear`) — прямыми вызовами, т. к. события не подходят для синхронного возврата данных.

## Настройки окружения

Полный список переменных — в [`docs/environment.md`](docs/environment.md). Ключевые:

- `TELEGRAM_BOT_TOKEN` — обязателен
- `OLLAMA_URL` (по умолчанию `http://127.0.0.1:11434`)
- `OLLAMA_MODEL` (по умолчанию `qwen3:0.6b`)
- `SYSTEM_PROMPT` — системная инструкция модели
- `MAX_CONCURRENCY` — параллельные обработки (по умолчанию `4`)
- `COUNT_MESSAGE_LIMIT` — лимит сообщений в истории (по умолчанию `10`)
- `COUNT_MESSAGE_SUMMARY_LIMIT` — порог сжатия в резюме (по умолчанию `6`)

## Этапы разработки

Изначально код писался через внутренний чат-ИИ редактора Cursor. В дальнейшем проект переведён на многомодульную архитектуру и разделён на пакеты через in-memory event-bus — прямые вызовы между `chat` и `history` заменены на события.
