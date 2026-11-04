# B1 API

All paths are relative to the backend base URL. Except for `POST /auth/dev-login`, endpoints require:

```http
Authorization: Bearer <token>
```

Successful responses use a `{ "data": ... }` envelope. Errors use the contract shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A human-readable explanation",
    "details": []
  }
}
```

## Session and profiles

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/dev-login` | Issue a development JWT for a seeded user. Requires `NODE_ENV=development`; body is `{ "username": "aanya" }` and defaults to Aanya. |
| GET | `/me` | Read the authenticated user. |
| GET | `/me/profile` | Read the authenticated user's profile. |
| GET | `/profiles/:userId` | Read a profile by user ID. |

Development login returns `{ "data": { "token": "...", "user": { ... } } }`. Seed usernames are `aanya`, `rohan`, `karthik`, `arjun`, `varun`, `siddharth`, `aditya`, `sai-kiran`, and `nikhil`.

## Discover

| Method | Path | Purpose |
|---|---|---|
| GET | `/discover?query=&filters=` | List discoverable profiles, excluding the current user, active connections, and pending requests. |

`query` is an optional text search. `filters` is an optional URL-encoded JSON object with supported string fields `gender`, `education`, and `profession`. The endpoint returns at most 50 profiles.

## Requests and connections

| Method | Path | Purpose |
|---|---|---|
| POST | `/requests` | Send a request; body is `{ "recipientId": "<userId>" }`. |
| GET | `/requests?box=received` or `/requests?box=sent` | List the authenticated user's pending requests. |
| POST | `/requests/:id/accept` | Accept a request addressed to the authenticated user and create an active connection at stage `connect`. |
| POST | `/requests/:id/decline` | Decline a request addressed to the authenticated user. |
| DELETE | `/requests/:id` | Withdraw a request sent by the authenticated user. |
| GET | `/connections?status=active` | List active connections belonging to the authenticated user. |
| GET | `/connections/:id` | Read a connection only if the authenticated user is one of its participants. |

Sending, accepting, declining, and withdrawing a request generate a notification for the other affected user.

## Home and notifications

| Method | Path | Purpose |
|---|---|---|
| GET | `/home` | Return greeting, pending request counts, current connection/stage, and unread notification count. |
| GET | `/notifications` | List notifications owned by the authenticated user. |
| POST | `/notifications/:id/read` | Mark an owned notification as read. |

## Local setup

Configure `MONGODB_URI` and a private `JWT_SECRET` of at least 32 characters in `backend/.env`. Do not commit `.env`. The seed command is repeatable and upserts the nine fictional users and their profiles:

```powershell
cd backend
npm run seed
$env:NODE_ENV = "development"
npm run dev
```

For a non-watch start use `npm start` after setting `NODE_ENV` and configuring the same environment variables.

The regular test command runs the isolated B1 and B2 unit tests. To run the MongoDB-backed request lifecycle test, set `NODE_ENV=development` and run `npm run test:integration`. It requires all nine seeded users, an available MongoDB connection, and no existing active connection or pending request between Aanya and Rohan. The test removes the request, connection, and notifications it creates.

## B2 journey and reflection

The eight lowercase stage keys are `connect`, `understand`, `reflect`, `discuss`, `agree`, `family`, `reflect_again`, and `decision`. `Connection.stage` is the canonical journey cursor. Journey status is derived from it: earlier stages are `completed`, the current stage is `active`, and later stages are `locked`. Completing `decision` sets the cursor to `complete`, meaning all eight stages are completed and none is active. Only the currently active stage can be completed; concurrent or repeated completion attempts cannot advance the journey twice.

Stage descriptions and reflection question wording are **fictional mock content**, marked with `isMock: true` and `[MOCK]` prompts. They were authored for development and are not represented as matching Figma.

| Method | Path | Purpose |
|---|---|---|
| GET | `/connections/:connectionId/journey` | Return the authorized participant's derived eight-stage journey. |
| GET | `/connections/:connectionId/stages/:stage` | Read seeded mock content for an unlocked stage. Response content has `guidance`, `forYou`, `activities`, `resources`, and `isMock`. |
| POST | `/connections/:connectionId/stages/:stage/complete` | Complete only the active stage and atomically advance to the next. Completing Reflect requires all 10 valid answers by the caller. |
| GET | `/connections/:connectionId/reflect/questions` | Read the ten ordered questions while Reflect is unlocked. |
| PUT | `/connections/:connectionId/reflect/answers/:questionId` | Create or edit the caller's answer. Body contains `value`, optional `otherText`, and optional `sharing`. |
| GET | `/connections/:connectionId/reflect/progress` | Return the caller's answers and only the match's `share_with_match` answers, plus the caller's completion count. |
| PUT | `/me/sharing-default` | Set the caller's default for future answer writes. Body: `{ "sharing": "keep_private" }`, `"share_with_match"`, or `"share_later"`. |

Supported answer types are `single_select`, `multi_select`, `rating` (configured range 1–5), and `free_text` (up to 500 characters). Each answer has its own `sharing` value. The default is `keep_private`. `share_later` remains private until its author changes that answer's sharing value. Updating the user's default does not change existing answers.

Every journey and reflection route verifies connection membership. The progress query filters the match's answers in MongoDB to `sharing: "share_with_match"`; `keep_private` and `share_later` answers are never returned to the match. The optional both-users-must-complete stage gate and all Setu Guide behavior remain out of scope.

Run `npm run seed` to repeatably upsert the B2 mock stage content and exactly ten mock questions along with the existing fictional users. Run `npm run test:b2` for B2 unit and MongoDB integration tests; it requires `NODE_ENV=development`, the seeded fixtures, database connectivity, and no existing active Aanya–Rohan connection. It deletes only the test connection, request, and answers it creates. The integration suite can also be run alone with `npm run test:b2:integration`.

## B3 chats

Chat records belong to one active connection. A chat is created lazily when a member lists chats, and each user may access it only while they are a participant in its connection. Chat and message APIs require a bearer JWT. Chat lists and message history are retrieved by polling; WebSockets are not used.

| Method | Path | Purpose |
|---|---|---|
| GET | `/chats?filter=all` | List the authenticated user's active-connection chats and unread counts. |
| GET | `/chats?filter=active` | List chats not muted by the authenticated user. |
| GET | `/chats?filter=new` | List chats with unread messages for the authenticated user. |
| GET | `/chats?filter=muted` | List chats muted by the authenticated user. |
| GET | `/chats/:chatId/messages?cursor=` | Read a page of messages; omit the cursor for the newest page. |
| POST | `/chats/:chatId/messages` | Send a message. |
| POST | `/chats/:chatId/read` | Mark all messages from the other member as read. |
| PUT | `/chats/:chatId/mute` | Set the authenticated user's mute preference. |

`filter` defaults to `all`; any value outside `all`, `active`, `new`, and `muted` is rejected. Each chat item contains `id`, `connectionId`, the other `participant`, the connection's current `stage`, the caller-specific `muted` flag and `unreadCount`, and `lastMessageAt`.

Send a message:

```http
POST /chats/CHAT_ID/messages
Authorization: Bearer JWT
Content-Type: application/json
```

```json
{ "text": "Hello, it is nice to connect." }
```

Text must be a non-empty string of at most 2,000 characters. Successful sends return `201` and `{ "data": { "message": { "id": "...", "senderId": "...", "text": "...", "createdAt": "...", "isReadByMe": true } } }`.

Read messages:

```http
GET /chats/CHAT_ID/messages?cursor=MESSAGE_ID
Authorization: Bearer JWT
```

Pages contain up to 30 messages in chronological order. The first request returns the newest page; pass its `nextCursor` to retrieve the preceding page. `nextCursor` is `null` when no older page remains. Each message contains `id`, `senderId`, `text`, `createdAt`, and whether it has been read by the caller. Invalid chat IDs or cursors return a validation error. An authenticated non-member receives `403`.

Mark received messages read:

```http
POST /chats/CHAT_ID/read
Authorization: Bearer JWT
```

Response: `{ "data": { "markedRead": 2 } }`, where the count is the number of messages updated.

Mute or unmute for the current member only:

```http
PUT /chats/CHAT_ID/mute
Authorization: Bearer JWT
Content-Type: application/json
```

```json
{ "muted": true }
```

Response: `{ "data": { "chatId": "...", "muted": true } }`. Chat data is not added to B1 connection responses. Re-running `npm run seed` does not create chat or message duplicates; chats and messages are created by the chat APIs, not by the seed operation.

## B3 profile and partner preferences

| Method | Path | Purpose |
|---|---|---|
| PATCH | `/me/profile` | Update editable fields on the authenticated user's own profile. |
| GET | `/me/preferences/:section` | Read one of the caller's preference sections. |
| PATCH | `/me/preferences/:section` | Merge validated preference values into the caller's section. |

Editable profile fields are `age`, `gender`, `heightCm`, `avatarUrl`, `profileStatus`, `bio`, `education`, `profession`, `interests`, `lifestyle`, and `family`. Ownership fields and unrecognized fields are rejected. Values follow the existing profile schema limits; text and list lengths are additionally checked by the API. Example:

```http
PATCH /me/profile
Authorization: Bearer JWT
Content-Type: application/json
```

```json
{ "bio": "I enjoy thoughtful conversations.", "interests": ["Reading", "Walking"] }
```

The response uses the existing `{ "data": { "profile": ... } }` profile shape. The update applies only to the authenticated user.

Supported preference sections are `basic`, `lifestyle`, `family`, `valuesOutlook`, and `additional`, matching the current Mongoose schema. Preference payloads must be JSON objects; nested objects are limited to four levels, arrays to 50 entries, and strings to 500 characters. Field names containing `$` or `.` and prototype-related names are rejected. A PATCH merges supplied object values into the existing section; arrays and scalar values replace their previous values.

Example:

```http
PATCH /me/preferences/basic
Authorization: Bearer JWT
Content-Type: application/json
```

```json
{ "conversationPace": "gradual", "sharedValues": ["kindness", "curiosity"] }
```

The response is `{ "data": { "section": "basic", "preferences": { ... } } }`. These are flexible preference values because the project contract does not define a per-field partner-preference schema.

## B3 staging readiness

The service uses the existing `PORT`, `NODE_ENV`, `MONGODB_URI`, and `JWT_SECRET` environment variables. `JWT_SECRET` must be at least 32 characters. Keep credentials in the deployment environment; do not commit `.env`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health/live` | Process liveness; returns HTTP 200 while the server is serving requests. |
| GET | `/health/ready` | Readiness; returns HTTP 200 when MongoDB is connected, otherwise HTTP 503. |

Start with `npm start` after configuring deployment environment variables. The process handles `SIGINT` and `SIGTERM` by stopping the HTTP listener and disconnecting MongoDB. Configure the hosting platform's health check to use `/health/ready`. No provider-specific deployment is performed or included.

## Setu Guide integration status

`POST /guide/chat` is pending external staging integration and is **not implemented**. The project PDF names its expected request/response contract but says the lead supplies the staging address privately. The staging base URL, endpoint path if different from `/guide/chat`, and authentication requirements/credentials are unavailable. Do not configure invented values. The endpoint must not be enabled until the actual staging URL and authentication contract are provided. The Setu Guide AI service itself remains out of scope.

## B3 tests

`npm test` includes the B3 unit tests. Run `npm run test:b3:integration` for MongoDB-backed B3 tests; this requires all nine seeded users, `NODE_ENV=development`, a configured `JWT_SECRET`, and a reachable MongoDB instance. The integration test chooses a seeded-user pair without an existing active connection, creates temporary connection/chat/message data, and removes its data and restores the profile afterward.
