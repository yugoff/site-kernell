# Kernell Cloud

Отдельное серверное приложение для `cloud.kernell.ru` в ветке `cloud-portal`.
Основной сайт продолжает собираться из корневого `app/` как статический экспорт.
Cloud использует собственные `app/`, конфигурацию, TypeScript и каталог сборки.
Палитра и типографика совпадают с основным сайтом и версией по мотивам brag: сливочный фон, бордовый маркер, тёмные терминальные блоки, Geist и Geist Mono. Шрифты размещены локально, включая кириллицу; лицензии SIL OFL находятся в `fonts/`. Внешние запросы к Google Fonts для сборки и показа Cloud не требуются.
Общие элементы сохраняют масштаб бренда: высота шапки 64 px, логотип 16 px, навигация и кнопка входа 14 px, контейнер 1320 px с отступами до 48 px. У Cloud собственная композиция, компактный подвал и отдельный финальный блок главной. Стили общих элементов собраны в `app/chrome.css`.
Подписи разделов следуют `.k3-label` и `.k3-eyebrow` основного сайта: строчный текст, Geist Mono 14 px, круглый маркер 8 px и интервал 10 px. Первичная подпись нейтрального цвета с бордовой точкой. Основные кнопки витрины используют форму пилюли и типографику `.k3-btn`.
Меню, ссылки подвала и основные действия пишутся со строчной буквы. У знака `TM` повторены параметры основного сайта с учётом Tailwind preflight: размер 9 px, вес 500, нулевая высота строки, подъём на 0.5 em и унаследованный межбуквенный интервал логотипа.

## Локальный запуск

Нужен Node.js 22 LTS. Команды из корня репозитория.

```bash
npm ci
npm run db:cloud:local
npm run build:cloud
npm run preview:cloud
```

Откройте `http://localhost:3001`. Preview запускает собранный Worker через Wrangler и использует локальную D1. Для разработки с горячей перезагрузкой используйте `npm run dev:cloud` после той же локальной миграции.

Для локальных настроек скопируйте [`.dev.vars.example`](.dev.vars.example) в `cloud/.dev.vars`. Токен Timeweb позволит искать домены и читать каталог. `CLOUD_SALES_ENABLED=false` блокирует пополнение кошелька, оплату заказов и изменения через API Timeweb. Создание черновиков и демокабинет доступны.

```bash
npm run check:cloud
npm run test:cloud
```

Тесты требуют `npm run build:cloud`. Они запускают workerd с отдельными временными D1 и заглушками Timeweb, ЮKassa и почтового шлюза. Сценарии включают регистрацию, cookie-сессии, сброс пароля, анкету администратора, вебхуки, пополнение, оплату заказа и выдачу услуг.

## Worker и D1

Используем Next.js 16, OpenNext и профиль совместимости Node.js. Серверный код получает `DB` из bindings Wrangler. Схема — в каталоге [`migrations/`](migrations). Денежные операции используют условные SQL-запросы в атомарном `DB.batch()`. Хеши паролей scrypt, cookie сессии и формат AES-256-GCM совместимы с прежней версией при сохранении ключа.

`cloud/worker.ts` запускает обслуживание раз в пять минут через Cron Trigger. Для запуска нужен `CLOUD_INTERNAL_SECRET`. При выключенных продажах обрабатывается только очистка истёкших записей. При включённых продажах Cron также ведёт очередь, синхронизацию и расчёт подписок. Задачи с неизвестным результатом у Timeweb отмечаются `needs_review`. Проверьте ресурс в Timeweb перед повтором или возвратом денег.

Секреты production задаются как **Worker secrets**. Сборка исключает значения из локальных файлов окружения и проверяет комплект Worker перед отправкой. Для публичного запуска с анкетами администратора нужны настроенный ключ шифрования и согласованное место хранения персональных данных. Тариф Workers Free ограничивает HTTP-запросы 10 мс CPU. Для рабочего кабинета с scrypt планируйте Workers Paid и проверьте фактический CPU в Cloudflare Metrics. [Лимиты Workers](https://developers.cloudflare.com/workers/platform/limits/) · [Размещение данных D1](https://developers.cloudflare.com/d1/configuration/data-location/)

## Автоматический деплой cloud-portal

1. В Cloudflare авторизуйтесь и один раз создайте базу. Обе команды из корня репозитория.
   ```bash
   npx wrangler login
   npx wrangler d1 create kernell-cloud-db
   ```
   Скопируйте `database_id`. Скрипт подставляет этот ID при деплое. Нулевой ID в репозитории используется для локальной D1.
2. В GitHub откройте **Settings → Secrets and variables → Actions**. Добавьте секрет `CLOUDFLARE_API_TOKEN` с правами на деплой **этого Worker** и миграции D1 в нужном аккаунте. Задайте переменные `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID` и `CLOUD_WORKERS_DEPLOY=true`. Пока `CLOUD_WORKERS_DEPLOY` выключен, workflow ограничится сборкой и тестами. [Права Workers](https://developers.cloudflare.com/workers/authorization/workers/)
3. Запустите **Kernell Cloud Workers** для ветки `cloud-portal` или сделайте push в эту ветку. После тестов workflow применит миграции D1 и обновит `kernell-cloud`. Первый запуск можно проверить по адресу `workers.dev`.
4. В Cloudflare Worker откройте **Settings → Variables and Secrets**. Задайте `CLOUD_DATA_ENCRYPTION_KEY` (32 случайных байта, hex или Base64) и `CLOUD_INTERNAL_SECRET`. Для поиска доменов добавьте `TIMEWEB_TOKEN`, для подтверждения email и сброса пароля — `MAILER_WEBHOOK_URL` и `MAILER_WEBHOOK_TOKEN`. Секреты ЮKassa и вебхуков задаются в этом же разделе при подключении соответствующих интеграций.
5. Когда отдельно согласуете переключение поддомена, привяжите **только** `cloud.kernell.ru` в **Workers & Pages → kernell-cloud → Settings → Domains & Routes**. Cloudflare при этом управляет DNS, поэтому выполняйте этот шаг отдельно от деплоя. Задайте в GitHub `CLOUDFLARE_WORKERS_ORIGIN=https://cloud.kernell.ru` и запустите workflow ещё раз. Дальнейшие обновления Worker будут выходить на привязанный hostname. Workflow не создаёт и не удаляет DNS-записи. [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

Для ручного обновления установите те же переменные окружения, выполните `npm run build:cloud` и `npm run test:cloud`. Затем:

```bash
npm run db:cloud:remote
npm run deploy:cloud
```

Секреты аккаунта Timeweb, ЮKassa и шифрования принадлежат окружению Worker. Токен для публикации — секрет GitHub Actions. Конфигурация деплоя оставляет `CLOUD_SALES_ENABLED=false`. Перед разрешением реальных покупок отдельно проверьте выставление чеков, сценарии отмены, продление доменов и восстановление задач у провайдера.

### Перенос данных существующей SQLite

Этот шаг нужен, если есть реальные данные в старой базе. Остановите записи в исходную SQLite, сделайте резервную копию и примените миграции к **пустой** целевой D1.

```bash
python3 scripts/export-cloud-d1.py /path/to/cloud.sqlite cloud/.data/import.sql
cd cloud
npx wrangler d1 execute kernell-cloud-db --remote --file=.data/import.sql
```

Создайте каталог `cloud/.data` заранее. Экспорт содержит пользовательские записи. Файл создаётся с правами `0600`; держите его вне Git и удалите после сверки. Сравните количество записей в таблицах `users`, `services`, `orders`, `ledger_entries` и проверьте вход со старым аккаунтом. Для расшифровки существующих анкет и паролей сервисов нужен прежний `CLOUD_DATA_ENCRYPTION_KEY`. Если старая версия шифровала без отдельного секрета, сначала перенесите эти записи на новый ключ вне Cloudflare.

Справочник интеграции с провайдером и локальный снимок OpenAPI находятся в [Timeweb Reseller Docs](docs/timeweb-reseller/README.md).
