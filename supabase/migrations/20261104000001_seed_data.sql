DO $$
DECLARE
  v_manager_id UUID;
  v_worker1_id UUID;
  v_worker2_id UUID;
  v_proj1_id UUID := gen_random_uuid();
  v_proj2_id UUID := gen_random_uuid();
  v_proj3_id UUID := gen_random_uuid();
  v_task1_id UUID := gen_random_uuid();
  v_task2_id UUID := gen_random_uuid();
  v_task3_id UUID := gen_random_uuid();
  v_task4_id UUID := gen_random_uuid();
  v_task5_id UUID := gen_random_uuid();
BEGIN
  SELECT id INTO v_manager_id FROM public.profiles WHERE role = 'manager' LIMIT 1;
  SELECT id INTO v_worker1_id FROM public.profiles WHERE email LIKE 'worker1%' LIMIT 1;
  SELECT id INTO v_worker2_id FROM public.profiles WHERE email LIKE 'worker2%' LIMIT 1;

  -- Временно отключаем триггер проверки auth.uid() для пакетной заливки через SQL Editor
  ALTER TABLE public.tasks DISABLE TRIGGER trg_before_task_insert;
  ALTER TABLE public.tasks DISABLE TRIGGER trg_before_task_update;

  -- 1. Создаем 3 строительных объекта
  INSERT INTO public.projects (id, name, address) VALUES
    (v_proj1_id, 'ЖК «Северный Парк» (Корпус 1)', 'г. Москва, ул. Дыбенко, вл. 7'),
    (v_proj2_id, 'БЦ «Горизонт»', 'г. Москва, Ленинградский пр-т, д. 36'),
    (v_proj3_id, 'Складской комплекс «Логистик-Юг»', 'Московская обл., г. Подольск, Промзона 4');

  -- 2. Создаем задачи (сработает триггер trg_after_task_insert и запишет создание в историю)
  INSERT INTO public.tasks (id, title, description, project_id, assignee_id, author_id, status) VALUES
    (v_task1_id, 'Монтаж опалубки перекрытия 3-го этажа', 'Установить телескопические стойки и уложить ламинированную фанеру по осям А-Г.', v_proj1_id, v_worker1_id, v_manager_id, 'new'),
    (v_task2_id, 'Армирование фундаментной плиты', 'Вязка арматуры d16 А500С с шагом 200x200 мм. Подготовить акты скрытых работ.', v_proj1_id, v_worker1_id, v_manager_id, 'new'),
    (v_task3_id, 'Разводка временного электроснабжения', 'Установить щиты ЩУР на этажах 1-4, протянуть кабель КГ 4х16.', v_proj2_id, v_worker1_id, v_manager_id, 'new'),
    (v_task4_id, 'Геодезическая разбивка осей здания', 'Вынести основные оси на обноску, закрепить реперы и сдать по акту.', v_proj2_id, v_worker2_id, v_manager_id, 'new'),
    (v_task5_id, 'Устройство песчано-щебеночного основания', 'Послойное уплотнение виброплитой с проливкой до коэффициента 0.95.', v_proj3_id, v_worker2_id, v_manager_id, 'new');

  -- 3. Продвигаем задачи по статусам и наполняем реалистичную историю
  -- Задача 2: Новая -> В работе
  UPDATE public.tasks SET status = 'in_progress' WHERE id = v_task2_id;
  INSERT INTO public.task_history (task_id, changed_by, old_status, new_status, comment)
  VALUES (v_task2_id, v_worker1_id, 'new', 'in_progress', 'Бригада вышла на участок, приступили к вязке нижнего пояса');

  -- Задача 3: Новая -> В работе -> На проверке
  UPDATE public.tasks SET status = 'in_review' WHERE id = v_task3_id;
  INSERT INTO public.task_history (task_id, changed_by, old_status, new_status, comment) VALUES
    (v_task3_id, v_worker1_id, 'new', 'in_progress', 'Получили кабель со склада'),
    (v_task3_id, v_worker1_id, 'in_progress', 'in_review', 'Щиты смонтированы, заземление подключено, прошу принять');

  -- Задача 4: Новая -> В работе -> На проверке -> На доработке
  UPDATE public.tasks SET status = 'needs_revision' WHERE id = v_task4_id;
  INSERT INTO public.task_history (task_id, changed_by, old_status, new_status, comment) VALUES
    (v_task4_id, v_worker2_id, 'new', 'in_progress', NULL),
    (v_task4_id, v_worker2_id, 'in_progress', 'in_review', 'Оси вынесены, марки на месте'),
    (v_task4_id, v_manager_id, 'in_review', 'needs_revision', 'Отклонение по оси В составляет 18 мм при допуске 5 мм. Переделать и приложить тахеометрическую съемку.');

  -- Задача 5: Новая -> В работе -> На проверке -> Принята
  UPDATE public.tasks SET status = 'accepted' WHERE id = v_task5_id;
  INSERT INTO public.task_history (task_id, changed_by, old_status, new_status, comment) VALUES
    (v_task5_id, v_worker2_id, 'new', 'in_progress', NULL),
    (v_task5_id, v_worker2_id, 'in_progress', 'in_review', 'Подушка готова, лаборатория провела замеры плотности'),
    (v_task5_id, v_manager_id, 'in_review', 'accepted', 'Принято без замечаний');

  -- Включаем защитные триггеры обратно
  ALTER TABLE public.tasks ENABLE TRIGGER trg_before_task_insert;
  ALTER TABLE public.tasks ENABLE TRIGGER trg_before_task_update;
END $$;