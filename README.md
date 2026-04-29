# Watch Party MVP

MVP веб-приложения для совместного просмотра одного YouTube-видео с синхронизацией плеера и чатом.

## Краткая Архитектурная Схема

```mermaid
flowchart LR
  Browser["React frontend<br/>YouTube IFrame API"] --> Gateway["API Gateway<br/>Node.js"]
  Browser <-->|Socket.io| Gateway
  Gateway --> Auth["Auth Service"]
  Gateway --> Room["Room Service"]
  Gateway --> Chat["Chat Service"]
  Gateway <-->|WS proxy| Realtime["Realtime/Sync Service"]
  Auth --> Postgres[(PostgreSQL)]
  Room --> Postgres
  Chat --> Postgres
  Room --> Redis[(Redis pub/sub + streams)]
  Chat --> Redis
  Realtime --> Redis
  Realtime --> Room
  Realtime --> Chat
```

## Сервисы И Ответственность

- `api-gateway`: единая REST-точка входа, CORS, JWT middleware для защищённых маршрутов, проксирование Socket.io на realtime-сервис.
- `auth-service`: регистрация, логин, выдача JWT access token, `/me`, событие `auth:user_registered`.
- `room-service`: комнаты, invite-коды, участники, лимит участников, owner/moderator права, каноническое состояние видео в `rooms.current_state`.
- `chat-service`: история сообщений, отправка сообщений, системные сообщения по событиям входа/выхода.
- `realtime-service`: Socket.io, presence в Redis, трансляция Redis-событий в комнаты, приём команд чата и плеера.
- `postgres`: основная БД.
- `redis`: pub/sub для realtime-событий, stream `watchparty:events`, short-lived presence.

## Схема БД

Основные таблицы находятся в [database/init.sql](./database/init.sql).

```sql
users(id, email, username, password_hash, created_at, updated_at)
rooms(
  id, owner_id, title, max_participants,
  youtube_url, youtube_video_id, invite_code,
  current_state jsonb, state_updated_at, created_at, updated_at
)
room_members(id, room_id, user_id, role, joined_at, left_at, is_active)
messages(id, room_id, user_id, type, content, created_at)
room_events(id, room_id, user_id, event_type, payload jsonb, created_at)
```

`rooms.current_state` хранит:

```json
{
  "status": "playing | paused | stopped",
  "positionSec": 42.5,
  "videoId": "dQw4w9WgXcQ",
  "action": "play",
  "updatedBy": { "id": "user-uuid", "username": "alice" },
  "updatedAt": "2026-04-29T12:00:00.000Z"
}
```

## API Контракт

Base URL для frontend: `http://localhost:8080`.

### `POST /auth/register`

Auth: public.

Request:

```json
{ "email": "alice@example.com", "username": "alice", "password": "password123" }
```

Response `201`:

```json
{ "user": { "id": "uuid", "email": "alice@example.com", "username": "alice" }, "accessToken": "jwt" }
```

Ошибки: `400 VALIDATION_ERROR`, `409 USER_ALREADY_EXISTS`.

### `POST /auth/login`

Auth: public.

Request:

```json
{ "email": "alice@example.com", "password": "password123" }
```

Response `200`:

```json
{ "user": { "id": "uuid", "email": "alice@example.com", "username": "alice" }, "accessToken": "jwt" }
```

Ошибки: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`.

### `GET /me`

Auth: `Bearer <jwt>`.

Response:

```json
{ "user": { "id": "uuid", "email": "alice@example.com", "username": "alice" } }
```

Ошибки: `401 UNAUTHORIZED`, `401 INVALID_TOKEN`, `404 USER_NOT_FOUND`.

### `POST /rooms`

Auth: `Bearer <jwt>`.

Request:

```json
{
  "title": "Friday movie",
  "maxParticipants": 8,
  "youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
}
```

Response `201`:

```json
{
  "room": {
    "id": "uuid",
    "title": "Friday movie",
    "ownerId": "uuid",
    "maxParticipants": 8,
    "activeCount": 1,
    "youtubeVideoId": "dQw4w9WgXcQ",
    "inviteCode": "code",
    "inviteUrl": "/invite/code",
    "currentUserRole": "owner",
    "currentState": {}
  }
}
```

Ошибки: `400 VALIDATION_ERROR`, `400 INVALID_YOUTUBE_URL`, `400 UNSUPPORTED_VIDEO_URL`, `401 INVALID_TOKEN`.

### `GET /rooms/:id`

Auth: `Bearer <jwt>`, пользователь должен быть активным участником.

Response:

```json
{ "room": { "id": "uuid", "members": [], "currentState": {} } }
```

Ошибки: `403 ROOM_MEMBERSHIP_REQUIRED`, `404 ROOM_NOT_FOUND`.

### `POST /rooms/:id/join`

Auth: `Bearer <jwt>`.

Request:

```json
{ "inviteCode": "optional-code" }
```

Response:

```json
{ "room": { "id": "uuid", "currentUserRole": "participant" } }
```

Ошибки: `403 INVALID_INVITE`, `409 ROOM_IS_FULL`, `404 ROOM_NOT_FOUND`.

### `POST /rooms/:id/leave`

Auth: `Bearer <jwt>`.

Response: `204 No Content`.

Ошибки: `404 ACTIVE_MEMBERSHIP_NOT_FOUND`.

### `GET /rooms/:id/messages`

Auth: `Bearer <jwt>`, пользователь должен быть активным участником.

Response:

```json
{ "messages": [{ "id": "uuid", "type": "user", "content": "Hi", "user": { "id": "uuid", "username": "alice" } }] }
```

Ошибки: `403 ROOM_MEMBERSHIP_REQUIRED`.

### `POST /rooms/:id/messages`

Auth: `Bearer <jwt>`.

Request:

```json
{ "content": "Hello" }
```

Response `201`:

```json
{ "message": { "id": "uuid", "type": "user", "content": "Hello" } }
```

Ошибки: `400 VALIDATION_ERROR`, `403 ROOM_MEMBERSHIP_REQUIRED`.

Дополнительно для invite-flow:

- `GET /rooms/invite/:inviteCode`
- `POST /rooms/invite/:inviteCode/join`
- `GET /rooms` для Dashboard.

## Real-Time События

Socket.io клиент подключается к `VITE_SOCKET_URL` с `auth: { token }`.

### Клиент -> сервер

`room:join`

```json
{ "roomId": "uuid" }
```

`room:leave`

```json
{ "roomId": "uuid" }
```

`chat:send_message`

```json
{ "roomId": "uuid", "content": "Hello" }
```

`sync:video_play`

```json
{ "roomId": "uuid", "positionSec": 12.3 }
```

`sync:video_pause`

```json
{ "roomId": "uuid", "positionSec": 12.3 }
```

`sync:video_seek`

```json
{ "roomId": "uuid", "positionSec": 90 }
```

`sync:video_stop`

```json
{ "roomId": "uuid", "positionSec": 0 }
```

### Сервер -> клиент

`chat:message_sent`

```json
{ "roomId": "uuid", "message": { "id": "uuid", "type": "user", "content": "Hello" } }
```

`sync:state_updated`

```json
{
  "roomId": "uuid",
  "action": "play",
  "state": {
    "status": "playing",
    "positionSec": 12.3,
    "videoId": "dQw4w9WgXcQ",
    "updatedBy": { "id": "uuid", "username": "alice" },
    "updatedAt": "2026-04-29T12:00:00.000Z"
  }
}
```

`presence:updated`

```json
{ "roomId": "uuid", "userIds": ["uuid"], "count": 1 }
```

`room:user_joined`

```json
{ "roomId": "uuid", "user": { "id": "uuid", "username": "alice" } }
```

`room:user_left`

```json
{ "roomId": "uuid", "user": { "id": "uuid", "username": "alice" } }
```

### Межсервисные события Redis

- `auth:user_registered`: `{ userId, email, username }`
- `room:created`: `{ roomId, ownerId, title, youtubeVideoId, inviteCode }`
- `room:user_joined`: `{ roomId, user: { id, username }, inviteCode }`
- `room:user_left`: `{ roomId, user: { id, username } }`
- `chat:message_sent`: `{ roomId, message }`
- `sync:video_play`: `{ roomId, action, state, updatedBy }`
- `sync:video_pause`: `{ roomId, action, state, updatedBy }`
- `sync:video_seek`: `{ roomId, action, state, updatedBy }`
- `sync:video_stop`: `{ roomId, action, state, updatedBy }`
- `sync:state_updated`: `{ roomId, action, state, updatedBy }`

## Локальный Запуск

1. Скопировать переменные окружения при необходимости:

```bash
cp .env.example .env
```

2. Запустить весь MVP:

```bash
docker compose up --build
```

3. Открыть:

- frontend: `http://localhost:5173`
- API gateway health: `http://localhost:8080/health`

## Структура Проекта

```text
frontend/                  React + Vite + Socket.io client + YouTube IFrame API
services/api-gateway/      REST gateway + JWT middleware + WS proxy
services/auth-service/     Auth/JWT/users
services/room-service/     Rooms/members/video state
services/chat-service/     Messages/history/system messages
services/realtime-service/ Socket.io sync/presence
services/shared/           Shared db/jwt/events/errors/validation utilities
database/init.sql          PostgreSQL schema
docker-compose.yml         Local infrastructure and services
```
