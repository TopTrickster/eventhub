# EventHub — студентски клубни събития

Курсов проект по Уеб програмиране (ТУ-София), тема „Клубни събития“. Студентите виждат предстоящите
събития на клубовете, записват се при свободни места и се отписват; организаторите управляват само
своите клубове и събития и могат да поискат AI чернова. Целите, правилата и критериите за приемане
(AC-1…AC-48) са в [`SPEC.md`](SPEC.md); инструкциите за агента са в [`AGENTS.md`](AGENTS.md).

Стек: Node.js 22+, Express 5, PostgreSQL (`pg`), React 19 + Vite, Vitest + Supertest + Testing Library.
Един Express процес обслужва `/api` и React приложението.

## Локално стартиране

Не е нужно да инсталирате PostgreSQL: `npm run db:local` пуска истински PostgreSQL от пакета
`embedded-postgres` на `localhost:5433` (данните са в `.pgdata/`, извън git).

Командите са по една на ред, защото Windows PowerShell 5.1 не поддържа `&&`.

**Терминал 1** (базата; оставете го отворен, спира се с Ctrl+C):

```bash
npm install
npm run db:local
```

**Терминал 2**:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

`db:seed` създава 2 организатора, 2 студента, 2 клуба и 3 бъдещи събития (едно пълно).
`npm run dev` пуска приложението на http://localhost:3000 (Express + Vite). Сървърът продължава да
работи и терминалът остава „зает“ — това е нормално: отворете адреса в браузъра. Ctrl+C го спира.

Ако `db:local` откаже да стартира, защото база от предишен (затворен) терминал още работи:
`npm run db:stop`, после отново `npm run db:local`.

Демо акаунти от seed-а (само локални тестови данни): `organizer1@eventhub.test`,
`organizer2@eventhub.test`, `student1@eventhub.test`, `student2@eventhub.test` с паролата, която
`npm run db:seed` отпечатва (или `SEED_PASSWORD`, ако е зададена).

Без `GEMINI_API_KEY` AI черновата връща резервно предложение; без `GOOGLE_CLIENT_ID`/`SECRET`
бутонът „Вход с Google“ обяснява, че входът не е настроен. Всички променливи са в
[`.env.example`](.env.example).

## Тестове

```bash
npm test                  # всички тестове срещу временна PostgreSQL база
npm run coverage          # + праг 80% общо и 100% за src/services
```

Тестовите заглавия съдържат номера на критерия (`AC-7 prevents overbooking concurrently`).
`tests/project/traceability.test.js` проверява, че всеки AC-N от `SPEC.md` има тест.

## Production

`Dockerfile` (build на клиента, после само production зависимости) и `render.yaml` за Render;
базата е Neon (`DATABASE_URL` с `?sslmode=require`). Миграциите се пускат при старт на контейнера.
Тайните се задават в Render/Codespaces, никога в git.

## Курсови проверки

```bash
node checks/ex2.mjs
node checks/ex3.mjs
node checks/ex4.mjs https://<адрес>
node mcp-server/check.mjs -- npm run --silent mcp
```
