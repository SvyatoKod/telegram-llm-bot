# Архитектура проекта

Telegram-бот, принимающий текстовые сообщения, хранящий историю диалога **в памяти** и отправляющий её в LLM (Ollama) для генерации ответа. Связь между доменными модулями построена на простой in-memory шине (`Node.js EventEmitter`) — прямых вызовов из одного доменного модуля в другой для записи в историю нет.

## Физическая структура

```
src/
├── index.js                         # composition root
├── config/
│   ├── dotenv.js                    # загрузка .env без зависимостей
│   └── config.js                    # валидация env, сбор объекта config
├── infra/
│   ├── httpJsonClient.js            # HTTP(S) JSON-клиент (keep-alive, таймауты)
│   ├── contextLog.js                # JSONL-лог контекста LLM (logs/llm-context-*.log)
│   ├── eventBus.js                  # обёртка над EventEmitter
│   └── events.js                    # константы имён событий
├── utils/
│   ├── number.js                    # clampInt
│   ├── semaphore.js                 # Semaphore для ограничения конкурентности
│   └── time.js                      # sleep
└── module/
    ├── orchestrator/
    │   ├── telegramClient.js        # вызовы Bot API (getUpdates/sendMessage)
    │   ├── telegramPoller.js        # long-polling, backoff, вызов handler
    │   ├── messageOrchestrator.js   # бизнес-логика сообщения (доменный координатор)
    │   └── index.js                 # фабрика createBot({...})
    ├── chat/
    │   ├── ollamaClient.js          # /api/chat, одна ретрия при ошибке
    │   ├── chatService.js           # сборка messages (system + history), summarize
    │   └── index.js                 # фабрика createChat({...})
    ├── history/
    │   ├── historyRepository.js     # in-memory Map<userId, messages[]>
    │   └── index.js                 # фабрика createHistory + подписки на события
    └── users/
        ├── userRepository.js        # in-memory Map<userId, user>
        └── index.js                 # фабрика createUsers + эмит UserCreated
```

## Зависимости между слоями

- `module/*` зависит от `infra/` и `utils/`, но **не** от других `module/*` напрямую (за исключением координатора — см. ниже).
- `orchestrator` остаётся координатором: знает о `users`, `history`, `chat` как об интерфейсах и шлёт им события либо читает публичное состояние (например, `history.getAll` для построения контекста LLM).
- `index.js` — composition root: создаёт `eventBus` и прокидывает одну и ту же ссылку во все модули-фабрики.

## Событийная шина

`src/infra/eventBus.js` — тонкая обёртка над Node `EventEmitter`:

- `on(event, listener)` — оборачивает listener в try/catch и перехватывает отклонённые промисы, чтобы одна упавшая подписка не ломала остальные;
- `emit(event, payload)` — прямой synchronous-emit.

Имена событий задаются в `src/infra/events.js`:

```js
EVENTS.USER_CREATED        = 'UserCreated';
EVENTS.MESSAGE_RECEIVED    = 'MessageReceived';
EVENTS.RESPONSE_GENERATED  = 'ResponseGenerated';
```

### Публикаторы и подписчики

| Событие              | Издатель                             | Подписчики                    | Полезная нагрузка                                                                 |
|----------------------|--------------------------------------|-------------------------------|-----------------------------------------------------------------------------------|
| `UserCreated`        | `users.identifyFromTelegram` (новый) | логгер в `index.js`           | `{ userId, telegramId, username, firstName, lastName, createdAt }`                |
| `MessageReceived`    | `MessageOrchestrator.handle`         | `history` (сохраняет user)    | `{ userId, chatId, messageId, content }`                                          |
| `ResponseGenerated`  | `chat.generateAnswer`                | `history` (сохраняет assistant)| `{ userId, chatId, replyToMessageId, answer, messagesSent }`                      |

`EventEmitter` в Node — **синхронный**: после `emit(MESSAGE_RECEIVED, ...)` подписчик `history` уже выполнил запись, поэтому следующий `history.getAll(userId)` видит только что сохранённое сообщение. Это важное свойство: мы сохраняем последовательность «сохранить → прочитать → отправить в LLM» без async-гонок.

### Что осталось прямыми вызовами

События подходят только для write-flow сообщений. Напрямую работают:

- `users.identifyFromTelegram(tgUser)` — должен вернуть пользователя синхронно, чтобы дальше было `userId`.
- `history.getAll(userId)` — чтение истории для сборки контекста.
- `history.replaceAll(userId, messages)` — массовая замена при суммаризации.
- `history.clear(userId)` — по команде `/clear`.
- `chat.generateAnswer(...)` — возвращает `{ answer, messagesSent }` в вызывающий код (и **дополнительно** эмитит `ResponseGenerated`).
- `chat.summarize({history, systemPrompt})` — внутренний вызов из оркестратора, события не генерирует (это техническая суммаризация, а не ответ пользователю).

## Поток обработки входящего сообщения

```
Telegram API
     │  long-poll getUpdates
     ▼
TelegramPoller (module/orchestrator/telegramPoller.js)
     │  Semaphore.acquire()    // ограничение параллелизма MAX_CONCURRENCY
     ▼
MessageOrchestrator.handle(msg)  (module/orchestrator/messageOrchestrator.js)
     │
     ├─ users.identifyFromTelegram(msg.from)
     │      │  если пользователь новый:
     │      └──emit──▶ UserCreated
     │
     ├─ если msg.text === '/clear':
     │      ├─ history.clear(userId)
     │      ├─ contextLog: {event:'clear'}
     │      └─ telegram.sendMessage('История очищена') — завершение
     │
     ├─ emit MessageReceived { userId, chatId, messageId, content }
     │        └─▶ history-subscriber: addMessage(userId, {role:'user', content})
     │
     ├─ _compressHistoryIfNeeded(userId):
     │      если history.getAll.length > COUNT_MESSAGE_SUMMARY_LIMIT:
     │        ├─ contextLog: {event:'summary_start'}
     │        ├─ chat.summarize({history: head, systemPrompt})
     │        ├─ history.replaceAll(userId, [резюме, ...tail])
     │        └─ contextLog: {event:'summary_done'}
     │
     ├─ historyMessages = history.getAll(userId)
     │
     ├─ chat.generateAnswer({ userId, chatId, replyToMessageId, history, systemPrompt })
     │        │   внутри ChatService → OllamaClient.chat(messages)
     │        └──emit──▶ ResponseGenerated
     │                     └─▶ history-subscriber: addMessage(userId, {role:'assistant', content:answer})
     │        возвращает { answer, messagesSent }
     │
     ├─ contextLog: {event:'llm_request', messages, approxTokens}
     │
     └─ telegram.sendMessage({ chatId, replyToMessageId, text: answer })
```

При ошибке на шаге `chat.generateAnswer` оркестратор шлёт в Telegram уведомление «LLM недоступна» и выходит.

## In-memory состояние и ограничения

### История (`module/history`)

- Хранилище: `Map<userId, { role, content }[]>`.
- Ключ — `userId` = `msg.from.id` (строкой).
- Сообщение сохраняется, только если `role ∈ {user, assistant}` и `content.trim()` непустой.
- При превышении `COUNT_MESSAGE_LIMIT` удаляются **самые старые** сообщения.
- Теряется при рестарте процесса.

### Пользователи (`module/users`)

- Хранилище: `Map<userId, user>`.
- Создаётся один раз (при первом сообщении); в этот момент летит `UserCreated`.
- Теряется при рестарте.

### Суммаризация (`COUNT_MESSAGE_SUMMARY_LIMIT`)

Если длина истории превысила порог, «старая часть» заменяется одним сообщением с резюме:

- head = `all.slice(0, all.length - tailKeep)` — уходит в LLM;
- tail = последние `min(4, max(1, SUMMARY_LIMIT-1))` сообщений — сохраняются как есть;
- история заменяется на `[ {role:'assistant', content:'Резюме предыдущего диалога: ...'}, ...tail ]`.

### System prompt

`SYSTEM_PROMPT` вставляется первым сообщением (`role:'system'`) в запрос к LLM. Это делает `chat/chatService.js`, оркестратор только передаёт строку.

### Логирование контекста LLM

`logs/llm-context-YYYY-MM-DD.log` (JSONL, одна запись на строку). События:

- `summary_start` — перед запуском суммаризации
- `summary_done`  — после успешной замены истории
- `clear`         — пользователь выполнил `/clear`
- `llm_request`   — полный исходящий в LLM контекст (messages + approxTokens)

## Конкурентность и устойчивость

- `TelegramPoller` использует `Semaphore(MAX_CONCURRENCY)` — одновременно обрабатывается не больше `MAX_CONCURRENCY` сообщений; остальные ждут.
- При ошибке `getUpdates` применяется экспоненциальный backoff (250 мс → до 10 с).
- `OllamaClient.chat` делает одну повторную попытку при ошибке первой.
- `eventBus` изолирует подписчиков: брошенная ошибка в одном listener не ломает остальных и не отменяет publisher.

## Границы ответственности

- **`infra/*`** — технические примитивы, ничего не знают о Telegram/LLM.
- **`module/users`** — реестр пользователей; публикует `UserCreated`.
- **`module/history`** — хранилище, подписано на `MessageReceived`/`ResponseGenerated`; писать напрямую извне не нужно.
- **`module/chat`** — общение с LLM; публикует `ResponseGenerated`; истории не знает (получает её через параметр).
- **`module/orchestrator`** — доменный координатор: владеет Telegram API-клиентом, управляет циклом, собирает контекст для LLM, публикует `MessageReceived`, отправляет ответ пользователю.
- **`index.js`** — единственная точка, где объекты связываются между собой и с `eventBus`.
