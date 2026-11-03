# Kernell — сайт

Next.js 16 + Tailwind CSS 4, статический экспорт.

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # статика в ./out
```

## Версии

- `/` — основная, интерактивная версия (GSAP): `app/(home)`, компоненты в `components/v3`.
- `/v1/` — прежний сайт, `/v2/` — версия в стиле brag, `/v3/` — то же, что главная.
  Все три закрыты от индексации и не связаны ссылками с главной.
- Тексты, кейсы и цифры для `/`, `/v2/`, `/v3/` — в `lib/site-content.ts`.

## Шахматный турнир

`/chess/` — страница турнира в стиле основного сайта. Состояние хранится в localStorage
браузера; сервера и регистрации нет. Разные браузеры и устройства имеют отдельные турниры.

```bash
npm run dev          # http://localhost:3000/chess/
npm run test:chess   # проверки жеребьёвки, очков, пропусков и восстановления
npm run build:chess  # отдельная сборка для chess.kernell.ru в out-chess/
```

`build:chess` размещает турнир в корне отдельного сайта и задаёт его метаданные.
Обычный `npm run build` сохраняет главную
Kernell и добавляет `/chess/`. Перед публикацией основной версии запускайте её обычную сборку:
обе команды используют рабочие каталоги Next.js `.next/` и `out/`.

### Публикация chess.kernell.ru через Cloudflare Pages

Два сайта используют один репозиторий. Основной `kernell.ru` продолжает публиковаться
на GitHub Pages существующим workflow. Для шахмат создаётся отдельный проект Cloudflare
Pages; изменения в его production-ветке автоматически запускают шахматную сборку.

1. В Cloudflare откройте Workers & Pages → Create application → Pages → Import an existing Git repository.
2. Подключите репозиторий `yugoff/site-kernell`. Назовите проект `kernell-chess`.
3. Укажите параметры сборки:

   | Параметр | Значение |
   | --- | --- |
   | Production branch | `chess-tournament` (ветка с шахматной страницей) |
   | Framework preset | `Next.js (Static HTML Export)` |
   | Build command | `npm run build:chess` |
   | Build output directory | `out-chess` |
   | Root directory | корень репозитория |
   | Environment variable | `NODE_VERSION` = `22` |
   | Environment variable | `BASE_PATH` = пустая строка |

4. Нажмите Save and Deploy и дождитесь успешной публикации на адресе проекта `*.pages.dev`.
5. В проекте откройте Custom domains → Set up a custom domain → `chess.kernell.ru`.
   Если зона `kernell.ru` в том же аккаунте Cloudflare, подтвердите предложенную DNS-запись.
   Если настройка ручная: `CNAME`, имя `chess`, значение — фактический адрес проекта `*.pages.dev`.
   Сначала добавьте домен в Pages, затем DNS. Одной DNS-записи без привязки домена в Pages недостаточно.
6. Дождитесь статуса Active для домена и сертификата HTTPS.

После объединения ветки с `main` можно поменять Production branch проекта Cloudflare на `main`.
Build command `npm run build:chess` при этом остаётся прежней: именно она выбирает шахматную главную.

Документация: [статический Next.js на Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/),
[подключение домена](https://developers.cloudflare.com/pages/configuration/custom-domains/).

Исходники логики — `lib/chess/tournament.ts`, интерфейса — `components/chess/`,
стилей — `app/chess/chess.css`. В жеребьёвке сумма очков не используется:
последний исход определяет группу. Внутри групп алгоритм максимального паросочетания
минимизирует повторные встречи; случайные варианты проверяются и для оставшихся игроков
из разных групп. Пропуски идут по постоянной случайной очереди, которая восстанавливается
при отмене тура. При равных очках место общее, порядок имён — алфавитный.
