-- ==========================================
-- 1. ТИПЫ ДАННЫХ (ENUMS)
-- ==========================================
CREATE TYPE public.user_role AS ENUM ('manager', 'worker');
CREATE TYPE public.task_status AS ENUM (
  'new',            -- Новая
  'in_progress',    -- В работе
  'in_review',      -- На проверке
  'accepted',       -- Принята
  'needs_revision'  -- На доработке
);

-- ==========================================
-- 2. ТАБЛИЦЫ
-- ==========================================

-- Профили пользователей (связаны с системной таблицей auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role public.user_role NOT NULL DEFAULT 'worker',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Объекты (стройки)
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  address TEXT NOT NULL CHECK (char_length(trim(address)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Задачи
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  description TEXT DEFAULT '',
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  assignee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  author_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status public.task_status NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- История изменений статусов задачи
CREATE TABLE public.task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  old_status public.task_status, -- NULL при первом создании задачи
  new_status public.task_status NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ И ТРИГГЕРЫ
-- ==========================================

-- Функция проверки: является ли текущий пользователь Постановщиком (manager)
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'manager'
  );
$$;

-- Триггерная функция при создании задачи:
-- 1. Принудительно ставит статус 'new' и автора = текущий юзер
-- 2. Проверяет, что исполнитель действительно имеет роль 'worker'
-- 3. Автоматически создает первую запись в task_history
CREATE OR REPLACE FUNCTION public.handle_task_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignee_role public.user_role;
BEGIN
  -- При создании задачи статус строго 'new'
  IF NEW.status <> 'new' THEN
    RAISE EXCEPTION 'При создании задачи статус должен быть "Новая" (new)';
  END IF;

  -- Автор всегда тот, кто создает
  NEW.author_id := auth.uid();

  -- Проверяем, что назначенный пользователь существует и является исполнителем
  SELECT role INTO v_assignee_role FROM public.profiles WHERE id = NEW.assignee_id;
  IF v_assignee_role IS NULL THEN
    RAISE EXCEPTION 'Назначенный исполнитель не найден';
  END IF;

  IF v_assignee_role <> 'worker' THEN
    RAISE EXCEPTION 'Назначать задачу можно только пользователю с ролью worker';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_before_task_insert
BEFORE INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.handle_task_created();

-- Запись в историю сразу после INSERT задачи
CREATE OR REPLACE FUNCTION public.log_task_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.task_history (task_id, changed_by, old_status, new_status, comment)
  VALUES (NEW.id, NEW.author_id, NULL, NEW.status, 'Задача создана');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_after_task_insert
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.log_task_creation();

-- Защита: если постановщик редактирует задачу напрямую (название, описание, исполнителя),
-- он НЕ может изменить статус в обход функции change_task_status
CREATE OR REPLACE FUNCTION public.prevent_direct_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignee_role public.user_role;
BEGIN
  -- Разрешаем смену статуса только если установлен локальный флаг внутри RPC функции
  IF NEW.status IS DISTINCT FROM OLD.status
     AND current_setting('app.allow_status_change', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'Прямое изменение статуса запрещено. Используйте RPC функцию change_task_status.';
  END IF;

  -- Не даем назначить задачу пользователю, который не является исполнителем
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    SELECT role INTO v_assignee_role FROM public.profiles WHERE id = NEW.assignee_id;
    IF v_assignee_role IS NULL THEN
      RAISE EXCEPTION 'Назначенный исполнитель не найден';
    END IF;
    IF v_assignee_role <> 'worker' THEN
      RAISE EXCEPTION 'Назначать задачу можно только пользователю с ролью worker';
    END IF;
  END IF;

  -- Не даем подменить автора или дату создания
  NEW.author_id := OLD.author_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_before_task_update
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.prevent_direct_status_change();

-- ==========================================
-- 4. RPC ФУНКЦИЯ СМЕНЫ СТАТУСА (ЯДРО БИЗНЕС-ЛОГИКИ)
-- ==========================================
CREATE OR REPLACE FUNCTION public.change_task_status(
  p_task_id UUID,
  p_new_status public.task_status,
  p_comment TEXT DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks;
  v_user_id UUID := auth.uid();
  v_user_role public.user_role;
  v_clean_comment TEXT := NULLIF(trim(COALESCE(p_comment, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Не авторизован';
  END IF;

  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Задача не найдена';
  END IF;

  -- Проверка прав и допустимых переходов строго по таблице из ТЗ:
  -- 1. Новая -> В работе (только назначенный исполнитель)
  IF v_task.status = 'new' AND p_new_status = 'in_progress' THEN
    IF v_task.assignee_id <> v_user_id THEN
      RAISE EXCEPTION 'Только назначенный исполнитель может взять задачу в работу';
    END IF;

  -- 2. В работе -> На проверке (только назначенный исполнитель)
  ELSIF v_task.status = 'in_progress' AND p_new_status = 'in_review' THEN
    IF v_task.assignee_id <> v_user_id THEN
      RAISE EXCEPTION 'Только назначенный исполнитель может отправить задачу на проверку';
    END IF;

  -- 3. На проверке -> Принята (только постановщик)
  ELSIF v_task.status = 'in_review' AND p_new_status = 'accepted' THEN
    IF v_user_role <> 'manager' THEN
      RAISE EXCEPTION 'Только постановщик может принять задачу';
    END IF;

  -- 4. На проверке -> На доработке (только постановщик + обязательный комментарий)
  ELSIF v_task.status = 'in_review' AND p_new_status = 'needs_revision' THEN
    IF v_user_role <> 'manager' THEN
      RAISE EXCEPTION 'Только постановщик может вернуть задачу на доработку';
    END IF;
    IF v_clean_comment IS NULL THEN
      RAISE EXCEPTION 'При возврате на доработку комментарий обязателен';
    END IF;

  -- 5. На доработке -> В работе (только назначенный исполнитель)
  ELSIF v_task.status = 'needs_revision' AND p_new_status = 'in_progress' THEN
    IF v_task.assignee_id <> v_user_id THEN
      RAISE EXCEPTION 'Только назначенный исполнитель может вернуть задачу в работу';
    END IF;

  ELSE
    RAISE EXCEPTION 'Недопустимый переход статуса из "%" в "%"', v_task.status, p_new_status;
  END IF;

  -- Разрешаем триггеру пропустить изменение статуса в рамках этой транзакции
  PERFORM set_config('app.allow_status_change', 'true', true);

  UPDATE public.tasks
  SET status = p_new_status
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  -- Записываем шаг в историю
  INSERT INTO public.task_history (task_id, changed_by, old_status, new_status, comment)
  VALUES (p_task_id, v_user_id, v_task.status, p_new_status, v_clean_comment);

  RETURN v_task;
END;
$$;

-- Внимание: в INSERT истории выше old_status нужно брать ДО перезаписи v_task.
-- Сразу исправим этот момент:
CREATE OR REPLACE FUNCTION public.change_task_status(
  p_task_id UUID,
  p_new_status public.task_status,
  p_comment TEXT DEFAULT NULL
)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task public.tasks;
  v_old_status public.task_status;
  v_user_id UUID := auth.uid();
  v_user_role public.user_role;
  v_clean_comment TEXT := NULLIF(trim(COALESCE(p_comment, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Не авторизован';
  END IF;

  SELECT role INTO v_user_role FROM public.profiles WHERE id = v_user_id;
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Задача не найдена';
  END IF;

  v_old_status := v_task.status;

  IF v_old_status = 'new' AND p_new_status = 'in_progress' THEN
    IF v_task.assignee_id <> v_user_id THEN
      RAISE EXCEPTION 'Только назначенный исполнитель может взять задачу в работу';
    END IF;
  ELSIF v_old_status = 'in_progress' AND p_new_status = 'in_review' THEN
    IF v_task.assignee_id <> v_user_id THEN
      RAISE EXCEPTION 'Только назначенный исполнитель может отправить задачу на проверку';
    END IF;
  ELSIF v_old_status = 'in_review' AND p_new_status = 'accepted' THEN
    IF v_user_role <> 'manager' THEN
      RAISE EXCEPTION 'Только постановщик может принять задачу';
    END IF;
  ELSIF v_old_status = 'in_review' AND p_new_status = 'needs_revision' THEN
    IF v_user_role <> 'manager' THEN
      RAISE EXCEPTION 'Только постановщик может вернуть задачу на доработку';
    END IF;
    IF v_clean_comment IS NULL THEN
      RAISE EXCEPTION 'При возврате на доработку комментарий обязателен';
    END IF;
  ELSIF v_old_status = 'needs_revision' AND p_new_status = 'in_progress' THEN
    IF v_task.assignee_id <> v_user_id THEN
      RAISE EXCEPTION 'Только назначенный исполнитель может вернуть задачу в работу';
    END IF;
  ELSE
    RAISE EXCEPTION 'Недопустимый переход статуса из "%" в "%"', v_old_status, p_new_status;
  END IF;

  PERFORM set_config('app.allow_status_change', 'true', true);

  UPDATE public.tasks
  SET status = p_new_status
  WHERE id = p_task_id
  RETURNING * INTO v_task;

  INSERT INTO public.task_history (task_id, changed_by, old_status, new_status, comment)
  VALUES (p_task_id, v_user_id, v_old_status, p_new_status, v_clean_comment);

  RETURN v_task;
END;
$$;

-- ==========================================
-- 5. ПРАВИЛА БЕЗОПАСНОСТИ (RLS POLICIES)
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history ENABLE ROW LEVEL SECURITY;

-- PROFILES: все авторизованные видят список профилей (чтобы отображать имена авторов/исполнителей)
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- PROJECTS: Постановщик видит всё, Исполнитель — только объекты, где у него есть задачи
CREATE POLICY "Projects SELECT policy"
ON public.projects FOR SELECT
TO authenticated
USING (
  public.is_manager() OR EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.project_id = projects.id AND tasks.assignee_id = auth.uid()
  )
);

-- PROJECTS: Создавать, менять и удалять объекты может только Постановщик
CREATE POLICY "Projects INSERT manager only"
ON public.projects FOR INSERT TO authenticated
WITH CHECK (public.is_manager());

CREATE POLICY "Projects UPDATE manager only"
ON public.projects FOR UPDATE TO authenticated
USING (public.is_manager())
WITH CHECK (public.is_manager());

CREATE POLICY "Projects DELETE manager only"
ON public.projects FOR DELETE TO authenticated
USING (public.is_manager());

-- TASKS: Постановщик видит все задачи, Исполнитель — только свои
CREATE POLICY "Tasks SELECT policy"
ON public.tasks FOR SELECT
TO authenticated
USING (
  public.is_manager() OR assignee_id = auth.uid()
);

-- TASKS: Создавать, редактировать поля и удалять задачи может только Постановщик
CREATE POLICY "Tasks INSERT manager only"
ON public.tasks FOR INSERT TO authenticated
WITH CHECK (public.is_manager());

CREATE POLICY "Tasks UPDATE manager only"
ON public.tasks FOR UPDATE TO authenticated
USING (public.is_manager())
WITH CHECK (public.is_manager());

CREATE POLICY "Tasks DELETE manager only"
ON public.tasks FOR DELETE TO authenticated
USING (public.is_manager());

-- TASK_HISTORY: Чтение доступно Постановщику (все) и Исполнителю (только по своим задачам)
CREATE POLICY "Task history SELECT policy"
ON public.task_history FOR SELECT
TO authenticated
USING (
  public.is_manager() OR EXISTS (
    SELECT 1 FROM public.tasks
    WHERE tasks.id = task_history.task_id AND tasks.assignee_id = auth.uid()
  )
);
-- На INSERT, UPDATE, DELETE для task_history политик НЕТ — значит через API никто
-- не может вручную добавить, изменить или удалить историю. Запись идет только через SECURITY DEFINER функции.