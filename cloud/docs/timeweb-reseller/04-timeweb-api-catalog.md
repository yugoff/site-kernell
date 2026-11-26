# 04. Полный каталог API Timeweb Cloud (31 категория, 336 эндпоинтов)

Источник: официальная OpenAPI-спецификация (`https://timeweb.cloud/api-docs-data/bundle.json`), локальная копия — [`openapi-bundle.json`](./openapi-bundle.json), плоский список всех 336 методов — [`endpoints-index.txt`](./endpoints-index.txt).

---

## 1. Общие правила работы с API Timeweb Cloud

- **Base URL:** `https://api.timeweb.cloud`
- **Авторизация:** `Authorization: Bearer $TIMEWEB_CLOUD_TOKEN` (JWT-токен из раздела *API и Terraform* панели управления; для AI Gateway API — ключ `sk-...`).
- **Rate Limiting:** **не более 20 запросов в секунду на одну конечную точку** с одного аккаунта → иначе `429 Too Many Requests`.
- **Пагинация/поиск:** `limit`, `offset`, `search`, `sort` (для коллекций; в ответе часто есть `meta.total`).
- **Трассировка ошибок:** большинство ответов содержат `response_id` (UUIDv4), при ошибках также `status_code`, `error_code`, `message`. Обязательно сохранять `response_id` в логи для тикетов в поддержку Timeweb.
- **Локации (`GET /api/v2/locations`):** `ru-1`, `ru-2`, `ru-3`, `ru-4`, `ru-5`, `pl-1`, `kz-1`, `nl-1`, `de-1`, `us-4` (конкретная доступность зависит от типа продукта и зоны `availability_zones`).

---

## 2. Матрица продуктов для перепродажи (по OpenAPI)

### 2.1. Облачные серверы (VDS / VPS) — 46 эндпоинтов
- **Справочники:**
  - `GET /api/v1/presets/servers` — готовые тарифы (`id`, `price`, `cpu`, `cpu_frequency`, `ram`, `disk`, `disk_type` [`ssd`/`nvme`/`hdd`], `bandwidth`, `location`, `is_allowed_local_network`, `tags`)
  - `GET /api/v1/configurator/servers` — гибкий конфигуратор (сборка кастомных CPU/RAM/Disk/GPU)
  - `GET /api/v1/os/servers` — доступные ОС (`os_id`)
  - `GET /api/v1/software/servers` — ПО из маркетплейса (`software_id`)
  - `GET /api/v2/locations` — локации и `availability_zones`
- **Создание и управление:**
  - `POST /api/v1/servers` — создание (поддерживает `project_id`, `preset_id` **или** `configuration`, `os_id` **или** `image_id`, `software_id`, `bandwidth` 100..1000 шаг 100, `is_ddos_guard` [L3/L4], `ssh_keys_ids`, `cloud_init` до 65 535 байт, `network`, `availability_zone`, `hostname`, `comment`).
  - `GET /api/v1/servers/{server_id}`, `PATCH /api/v1/servers/{server_id}`, `DELETE /api/v1/servers/{server_id}`.
  - Статусы (`vds.status`): `installing`, `software_install`, `reinstalling`, `on`, `off`, `turning_on`, `turning_off`, `hard_turning_off`, `rebooting`, `hard_rebooting`, `removing`, `removed`, `cloning`, `transfer`, `blocked`, `configuring`, `no_paid`, `permanent_blocked`.
  - Доступы на объекте `vds`: `root_pass`, `vnc_pass`, `networks` (IPv4/IPv6, PTR, `blocked_ports`).
  - Питание и действия: `POST .../start`, `.../shutdown`, `.../hard-shutdown`, `.../reboot`, `.../hard-reboot`, `.../reset-password`, `.../clone`, `.../boot-mode`, `.../image-unmount`, или универсальный `POST /api/v1/servers/{server_id}/action` (`hard_reboot`, `hard_shutdown`, `install`, `reboot`, `remove`, `reset_password`, `shutdown`, `start`, `clone`).
- **Доп. опции:**
  - Диски (`/disks`), автобэкапы и бэкапы дисков (`.../backups`, `download-url`, `action`: `restore`/`mount`/`unmount`), снапшоты (`/api/v1/restore-points/{vds_id}/create|commit|rollback`), дополнительные IP (`/ips` + PTR), SSH-ключи (`/api/v1/ssh-keys`), пользовательские образы (`/api/v1/images`), статистика (`/statistics`) и логи (`/logs`).

### 2.2. Домены и Почта — 30 + 14 эндпоинтов
- **Доступность и зоны (уже частично используется в проекте):**
  - `GET /api/v1/tlds` (`is_published`, `is_registered`) — список зон, цены `price` (регистрация), `prolong_price` (продление), `transfer`, `whois_privacy_price`, `allowed_buy_periods`, `early_renew_period`, `grace_period`.
  - `GET /api/v1/check-domain/{fqdn}` → `is_domain_available`.
- **Полный цикл регистрации / продления / трансфера:**
  1. **Создать администратора домена (`POST /api/v1/persons`):** три варианта схемы (`person` физлицо, `org` юрлицо, `ip` ИП). Для `.ru`/`.рф` физлицу обязательны ФИО, `is_resident`, `birthdate`, паспортные поля (`series`, `number`, `date`, `place`), `postcode`, `mailing_address`, `phone`, `email`; юрлицу — `name`, `contact_name`, `inn`, `kpp`, `legal_address`, `mailing_address`, `postcode`, `phone`, `email`.
  2. **Создать заявку (`POST /api/v1/domains-requests`):**
     - Регистрация: `{ action: "register", fqdn, person_id, period: "P1Y", is_autoprolong_enabled, is_whois_privacy_enabled }` *(whois privacy недоступна для `.ru` и `.рф`, период для `.ru`/`.рф` — `P1Y`..`P3Y`, для прочих зон до `P10Y`)*.
     - Продление: `{ action: "prolong", fqdn, period, person_id, is_autoprolong_enabled, ... }`.
     - Трансфер: `{ action: "transfer", fqdn, auth_code }`.
  3. **Оплатить/подтвердить заявку (`PATCH /api/v1/domains-requests/{request_id}`):**
     - Для реселлера с балансом Timeweb: `{ money_source: "use", person_id }` (списание с баланса мастер-аккаунта!). Для трансфера — `money_source: "free"`.
  4. **Отслеживание статуса (`GET /api/v1/domains-requests/{request_id}` / `GET /api/v1/domains/{fqdn}`):**
     - `domain_status`: `awaiting_payment`, `expired`, `final_expired`, `free`, `no_paid`, `ns_based`, `paid`, `soon_expire`, `today_expired`.
     - `request_status`: `registration_request`, `registration_fail`, `prolongation_request`, `prolongation_fail`, `transfer_request`, `transfer_fail`, `awaiting_person`.
- **Управление доменом и DNS:**
  - `PATCH /api/v1/domains/{fqdn}` (вкл/выкл автопродления), `POST /api/v1/add-domain/{fqdn}` (добавить внешний домен на DNS-хостинг), `DELETE /api/v1/domains/{fqdn}`.
  - NS-серверы: `GET/PUT /api/v1/domains/{fqdn}/name-servers`.
  - DNS-записи: предпочтительно `/api/v2/domains/{fqdn}/dns-records` (`GET`, `POST`, `PATCH`, `DELETE`), поддомены `/api/v1/domains/{fqdn}/subdomains/{subdomain}`, дефолтные записи `/default-dns-records`.
- **Корпоративная почта на домене (`Почта`):** `/api/v2/mail` и `/api/v1/mail` — создание ящиков по одному и батчем, спам-фильтры, смена пароля/квот.

### 2.3. Выделенные серверы (Dedicated) — 7 эндпоинтов
- Справочники: `GET /api/v1/presets/dedicated-servers` (`is_pre_installed`, `cpu`, `disk`, `memory`, `price`, `location`), `GET /api/v1/presets/dedicated-servers/{preset_id}/additional-services`.
- Заказ и управление: `POST /api/v1/dedicated-servers` (`preset_id`, `payment_period`: `P1M`/`P3M`/`P6M`/`P1Y`, `os_id`, `cp_id`, `bandwidth_id`, `plan_id`, `network_drive_id`, `additional_ip_addr_id`, `project_id`), `GET/PATCH/DELETE /api/v1/dedicated-servers/{dedicated_id}`.
- Особенности выдачи: поле `autoinstall_ready` / `is_pre_installed` показывает, выдаётся ли сервер автоматически или собирается инженерами вручную (`status`: `installing` → `installed`/`on`/`off`). Возвращает `ip`, `ipv6`, `password`, `vnc_pass`, `ipmi_ip`, `ipmi_login`, `ipmi_password`.

### 2.4. Облачные базы данных (DBaaS) — 40 эндпоинтов
- Поддерживаемые движки (`GET /api/v1/database-types`): `mysql`, `mysql8_4`, `postgres14`..`postgres18`, `valkey7`/`8_1`/`9_1`, `mongodb7`/`8_0`, `opensearch2_19`, `clickhouse`/`24`/`25`, `kafka`, `rabbitmq4_0`.
- Тарифы и конфигураторы: `GET /api/v2/presets/dbs`, `GET /api/v1/configurator/databases`, параметры `GET /api/v1/dbs/parameters` и `default-parameters`.
- Создание и управление: `POST /api/v1/databases` (поддерживает `project_id`, начального `admin`, `instance`, `network`, автобэкапы, `disk_autoscaling`, репликацию), `PATCH /api/v2/databases/{db_cluster_id}`, `POST /api/v1/databases/{db_cluster_id}/action` (`start`/`shutdown`/`reboot`).
- Внутренние сущности: админы/пользователи (`/admins`), базы (`/instances`), привилегии (`/privileges`), реплики (`/replicas`), бэкапы `v1` и S3-бэкапы `v2` (создание, восстановление, скачивание).

### 2.5. Managed Kubernetes — 25 эндпоинтов
- Справочники: `GET /api/v1/presets/k8s` (тарифы мастер- и воркер-нод), `GET /api/v1/k8s/k8s-versions`, `GET /api/v1/k8s/network-drivers` (`kuberouter`, `calico`, `flannel`, `cilium`).
- Управление: `POST /api/v1/k8s/clusters` (поддерживает `project_id`, `worker_groups`, `network_id`), `GET/PATCH/DELETE /api/v1/k8s/clusters/{cluster_id}`, скачивание `GET .../kubeconfig`, управление группами нод (`/groups`, масштабирование `/nodes`), дополнения/аддоны (`/addons`, `/addons-configs`), обновление версии (`PATCH .../versions/update`).

### 2.6. Объектное хранилище S3 — 14 эндпоинтов
- Справочник: `GET /api/v1/presets/storages` (тарифы и классы `hot`/`cold`).
- Создание и управление бакетом: `POST /api/v1/storages/buckets` (`name`, `type`: `private`/`public`, `preset_id` или `configurator`, `project_id`).
- Доступ клиента к S3: каждый бакет содержит собственные `hostname` (например `s3.twcstorage.ru`), `access_key`, `secret_key`, статистику `disk_stats`, `object_amount`, `website_config` (статический хостинг).
- Дополнительно: кастомные поддомены (`/subdomains`), генерация SSL-сертификата (`/api/v1/storages/certificates/generate`), перенос из стороннего S3 (`/api/v1/storages/transfer`).
- **Ограничение для реселлера:** не отдавать клиентам `/api/v1/storages/users` (аккаунт-глобальные админы хранилищ).

### 2.7. Сетевые сервисы, диски и CDN — 73 эндпоинта суммарно
- **Балансировщики (13):** `GET /api/v1/presets/balancers`, CRUD `/api/v1/balancers` (`project_id`, `algo` roundrobin/leastconn, `proto` http/http2/https/tcp, SSL, правила и IP-таргеты).
- **Firewall (14):** CRUD групп правил `/api/v1/firewall/groups`, правила ingress/egress (`/rules`), линковка к ресурсам (`/resources/{resource_id}`). *(Глобальные на аккаунте — нужен ownership в Kernell).*
- **VPC / Приватные сети (7):** `/api/v2/vpcs` (создание подсети в локации, просмотр подключённых сервисов), `/api/v1/vpcs/{vpc_id}/ports`, `DELETE /api/v1/vpcs/{vpc_id}`. *(Глобальные на аккаунте).*
- **Роутеры (23):** `GET /api/v1/presets/routers`, CRUD `/api/v1/routers` (`project_id`), подключение сетей, NAT, DNAT-правила проброса портов, статические маршруты, статистика.
- **Плавающие IP (7):** CRUD `/api/v1/floating-ips` (`is_ddos_guard`, `availability_zone`), `bind`/`unbind` к сервису. *(Глобальные на аккаунте).*
- **Сетевые диски (9):** `GET /api/v1/presets/network-drives`, CRUD `/api/v1/network-drives`, `mount`/`unmount` к доступным ресурсам. *(Глобальные на аккаунте).*
- **CDN (20):** `GET /api/v1/cdn/presets`, CRUD `/api/v1/cdn/http-resources` (`project_id`, источник `storage_id` или `server`), приостановка/возобновление (`suspend`/`resume`), очистка и прогрев кеша (`clear-cache`/`preload-cache`), статистика, выпуск Let's Encrypt или загрузка своего SSL (`/api/v1/cdn/certificates*`).

### 2.8. PaaS: App Platform и Container Registry — 22 + 7 эндпоинтов
- **Apps (`v1` / `v2`):** `GET /api/v1/presets/apps`, `frameworks/apps`, `deploy-settings/apps`; привязка Git (`vcs-provider`) или деплой готового `docker_image`; `POST /api/v2/apps` (`project_id`, `frontend`/`backend`, `envs`); ручной деплой, логи сборки и рантайма, `pause`/`resume`/`reboot`.
- **Container Registry:** `GET /api/v1/container-registry/presets`, CRUD `/api/v1/container-registry` (`project_id`), список репозиториев.

### 2.9. Линейка AI (Timeweb Cloud AI) — 141 эндпоинт суммарно!
Это огромный готовый продуктовый пласт, который полностью покрыт API (большинство сущностей поддерживают `project_id`):
- **AI Gateway (`14` + `20` эндпоинтов):** выпуск и отзыв API-ключей (`POST /api/v1/cloud-ai/ai-keys`, `project_id`), лимиты по сущностям/бюджету (`entity-limits`), статистика токенов/вызовов/моделей, и полный OpenAI-совместимый API (`/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`, `/v1/images/*`, `/v1/audio/*`, `/v1/files`, `/v1/batches`, `/v1/models`).
- **AI-агенты (`20`), Базы знаний (`19`), Модели и пакеты токенов (`8`), MCP (`20`), Навыки (`20`), Интеграции (`18`):** создание кастомных AI-агентов (с лимитами `money_limit` / `token_limit`), подключение RAG-баз знаний (документы/файлы/переиндексация), установка MCP-инструментов и навыков, подключение ботов Telegram / MAX / Crisp / Jivo.
- **AI-решения (`22`):** готовые решения (`solutions/types`), запуск/выключение, чат, подключение Telegram-бота.

### 2.10. Аккаунт, проекты и финансы — 38 эндпоинтов
- **Проекты (25):** CRUD `/api/v1/projects`, списки и привязка/перенос ресурсов (`servers`, `dedicated`, `databases`, `clusters`, `buckets`, `balancers`).
- **Оплата и стоимость (2):** `GET /api/v1/account/finances`, `GET /api/v1/account/services/cost`.
- **Аккаунт и безопасность (11):** `GET /api/v1/account/status`, настройки уведомлений (`/notification-settings`), ограничения авторизации по IP/странам (`/auth/access/*`).

---

## 3. Услуги с сайта Timeweb Cloud, которых НЕТ в Public API (`bundle.json`)

При проектировании витрины учитывайте, что **не всё** из маркетингового меню Timeweb Cloud сейчас автоматизируется через `bundle.json`:

| Услуга на сайте Timeweb Cloud | Статус в Public API | Как продавать на старте |
| :--- | :--- | :--- |
| **Публичное облако VMware** | Встречается только `"vmware"` в enum `service-price-type` (`/account/services/cost`), методов создания/управления нет | Только через заявку менеджеру / ручной ордер (индивидуальный расчёт) |
| **VDI (виртуальные рабочие столы)** | Нет эндпоинтов | Заявка менеджеру / ручной ордер |
| **Защита от DDoS L7 и WAF** | В API есть только `is_ddos_guard` (L3/L4) для VPS и Floating IP; в описании прямо сказано, что **L7 подключается через тикет в поддержку** | Автоматическая продажа L3/L4; L7 и WAF — через заявку в поддержку Kernell → тикет в Timeweb |
| **Отдельные SSL-сертификаты** | В API есть только SSL для CDN (`/api/v1/cdn/certificates*`) и генерация сертификата для S3-поддомена | Для CDN/S3 — через API; коммерческие SSL — сторонний провайдер или вручную |
| **Облако 1С / Серверы 152-ФЗ (аттестация)** | Отдельных API создания нет (технически это VPS/Dedicated + орг.-правовые документы) | Как пакетное решение по заявке / через менеджера Timeweb |
| **Мониторинг сервисов / Вебхуки / API-токены аккаунта** | В Public API нет CRUD-методов для вебхуков и API-токенов | Вебхуки (до 20 шт.) и API-ключи настраиваются вручную в панели Timeweb Cloud |
| **Субаккаунты / клиентский биллинг Timeweb** | Отсутствуют в Public API | Реализуется полностью на стороне Kernell Cloud |

