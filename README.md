# CRM для строительной компании

Тестовый проект на React + TypeScript + Supabase.

## Что реализовано

- Роли: `manager` (постановщик) и `worker` (исполнитель)
- Экраны:
  - вход по email/паролю
  - список объектов
  - карточка объекта со списком задач
  - карточка задачи (данные, действия, история)
  - "Мои задачи" для исполнителя
- Статусный workflow задачи:
  - `new -> in_progress` (только назначенный исполнитель)
  - `in_progress -> in_review` (только назначенный исполнитель)
  - `in_review -> accepted` (только постановщик)
  - `in_review -> needs_revision` (только постановщик, комментарий обязателен)
  - `needs_revision -> in_progress` (только назначенный исполнитель)
- История статусов: кто, когда, переход, комментарий

## Технологии

- React
- TypeScript
- Vite
- Supabase (Auth + Postgres + RLS)

## Быстрый запуск

### 1. Установить зависимости

```bash
npm install
```

### 2. Подготовить Supabase

1. Создайте проект в Supabase.
2. Выполните SQL миграции по порядку:
   - `supabase/migrations/20261104000000_init_schema.sql`
   - `supabase/migrations/20261104000001_seed_data.sql`

Важно: сид-миграция ожидает, что пользователи уже существуют в Auth и связаны с `public.profiles`.

### 3. Создать тестовых пользователей вручную

В Supabase Dashboard -> Authentication -> Users создайте минимум:

- `manager@crm.test`
- `worker1@crm.test`
- `worker2@crm.test`

Пароль можно задать одинаковый, например: `Password123!`.

### 4. Создать профили (связка с auth.users)

После создания пользователей вставьте записи в `public.profiles` с теми же `id`, что в `auth.users`.

Пример SQL:

```sql
insert into public.profiles (id, email, full_name, role)
select id, email, 'Иван Петров', 'manager'::public.user_role
from auth.users
where email = 'manager@crm.test'
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role;

insert into public.profiles (id, email, full_name, role)
select id, email, 'Алексей Смирнов', 'worker'::public.user_role
from auth.users
where email = 'worker1@crm.test'
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role;

insert into public.profiles (id, email, full_name, role)
select id, email, 'Дмитрий Кузнецов', 'worker'::public.user_role
from auth.users
where email = 'worker2@crm.test'
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role;
```

Если нужно, после этого повторно выполните сид-миграцию `20261104000001_seed_data.sql`.

### 5. Настроить окружение

Создайте `.env`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

### 6. Запуск

```bash
npm run dev
```

Приложение откроется на локальном адресе Vite (обычно `http://localhost:5173`).

## Безопасность

- RLS включен для `profiles`, `projects`, `tasks`, `task_history`
- Исполнитель видит только свои задачи и только связанные объекты
- Создание/редактирование/удаление объектов и задач доступны только постановщику
- Смена статуса проверяется в БД через `SECURITY DEFINER` RPC `change_task_status`
- Запрещены любые переходы, не описанные в ТЗ
- Для перехода `in_review -> needs_revision` комментарий обязателен на стороне БД
- Историю статусов нельзя подделать через API:
  - есть только `SELECT` policy
  - нет `INSERT/UPDATE/DELETE` policy
- Назначать задачу можно только пользователю с ролью `worker` (валидация в триггерах БД)
- Во фронтенде используется только публичный anon key; `service_role` не используется

## Сборка

```bash
npm run build
```

## Что важно для проверки

- Открытую регистрацию в Auth нужно отключить в настройках Supabase проекта (Dashboard -> Authentication -> Providers/Settings).
- Для демонстрации подготовьте минимум 1 постановщика и 2 исполнителей, и 2-3 объекта с задачами в разных статусах.
