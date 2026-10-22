# ZebMod 0.1.4 diagnostic — Filmix API

Дата: **22 жовтня 2026 року**. Мета випуску — отримати безпечні дані з TCL, а не оголосити мережу виправленою.

## Висновок і межі доказів

**Підтверджено локально:** HTTPS `filmixapp.cyou` відхиляється через невідповідність SAN сертифіката. Альтернативний домен із `fx.js`, `filmixapp.vip`, також має невідповідний сертифікат. До HTTP-відповіді ці два з'єднання не дійшли. **Конкретна причина збою на TCL ще NOT VERIFIED**: попередній звіт пристрою містить FAIL пошуку, але не результати нової діагностики.

Згідно з ТЗ, на TCL у 0.1.3 вже PASS: встановлене розширення, налаштування, стандартне джерело, відкриття компонента та Back. Це надані користувачем результати, не нове тестування з цього середовища. Пошук і відтворення Filmix на TCL не підтверджені.

У 0.1.4 додано діагностику поточного AJAX і локальні fixtures. `API_DEFAULT`, transport, token/device ID, proxy, авторизація, права якості, Player, IDs/Storage keys та інтеграція джерела збережені. Нормалізація `movie` Object **не реалізована**: обмеження тепер пояснюється на екрані.

## Джерела й відтворюваність

Повністю прочитано локальні `docs/Lampa_External_Plugin_References.md`, `lampa-online.js`, `README.md`, `tests/lampa-online.test.cjs` до редагування. Сторонні JS завантажені як текст у тимчасовий каталог, **не запускалися**, не імпортувалися та не декодувалися. Обфускація, `eval`, сторонні секрети та інфраструктура не переносилися.

| Позначення | Зафіксоване джерело | Git blob |
| --- | --- | --- |
| Z | [ZebMod 0.1.3](https://github.com/Zwanns/lampa-online/blob/02c0f8b7782a6503004d068ed42187aaa6944bff/lampa-online.js) | `d29048a967977bd325b04fddd2437462edbdbe96` |
| F | [fx.js](https://github.com/lampaplugins/store/blob/316f1aa20774041db76475ee5f9c2160ce2fd994/fx.js) | `72405bc6226428dddadd9c64a363e0379773edf6` |
| M | [online_mod.js](https://github.com/nb557/plugins/blob/9fbcac14ef8331ca8026a486e92c1a7f59220756/online_mod.js) | `8c58c0f218ab0b350a5ec8baf99f743761a661a4` |
| R | [Lampa Reguest](https://github.com/yumata/lampa-source/blob/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/utils/reguest.js) | `96bab1c5c55e2794eda37f4ef77fd764af1f88e3` |
| A | [Lampa Android bridge](https://github.com/yumata/lampa-source/blob/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/core/android.js) | `676594858916f16ecc194e94d3208f8ca62c9235` |

Опублікований Z збігався з локальним початковим 0.1.3 після нормалізації CRLF/LF. F/M blob збігаються з довідковим документом. Номери рядків нижче належать цим знімкам. «Код» означає підтвердження реалізації, **не успішний живий запит**. Статус впливу в таблицях відокремлено від факту реалізації.

## A. Endpoints і пошук

| Параметр | Z | F | M | Практичний вплив / доказ |
| --- | --- | --- | --- | --- |
| База API | `https://filmixapp.cyou/api/v2/`, змінювана | `http://filmixapp.vip/api/v2/` | `http://filmixapp.cyou/api/v2/` | Код: Z `apiUrl`; F 10–27; M 127–132, 4912. Інші host/scheme; робота HTTP не доводить роботу HTTPS. |
| Search | `search`, `story` encodeURIComponent | `search`, `story` encoded | `search`, очищена назва encoded | Код: F 305–344; M 5086–5098. Вплив нормалізації назви на конкретний збій — гіпотеза. |
| Post | `post/{numeric id}` | `post/{id}` | `post/{id}` | Код: F 367–380; M 5132–5156. Post не викликається до ручного вибору результату Z. |
| Profile | `user_profile` перед search, лише з token | Profile перед post/окремо | Profile перед post/окремо | Код: F 234–258, 347–365; M 5106–5129, 5579–5601. Помилка профілю Z не зупиняє гостьовий пошук. |
| Резервний пошук | Одне повторення за original title при порожньому результаті | Вибір схожих; автоматичне зіставлення року/назви | API → додатковий proxy-route → сайт `/api/v2/suggestions`, `search_word`, `posts` | Код: F 321–341; M 5073–5103. Нові fallback Z не додавалися; ефективність M не перевірена. |

У M сайт `https://filmix.gg` і API — різні маршрути. Сайт не можна підставляти замість API v2. У F порожній/пошкоджений search часто завершується загальним `doesNotAnswer`, що приховує причину. Z залишає ручний вибір результату й не запускає перший знайдений фільм автоматично.

## B–C. Transport і headers

| Аспект | Z | F | M | Доказ / наслідок |
| --- | --- | --- | --- | --- |
| API transport | Owned `$.ajax`, GET/text | `Reguest.silent` | `Reguest.native` | Код: F 315, 354, 370; M 5092, 5116, 5142; R 135–170, 649–652. |
| Android | WebView XHR | WebView XHR | `Android.httpReq` | Код R/A. Відмінність CORS суттєва; точний результат TCL — NOT VERIFIED. |
| Браузер | XHR | XHR | native fallback → XHR | Код R. Native-виклик у браузері не усуває CORS. |
| API User-Agent | Не задається плагіном | Не задається JS; UI вимагає підміни проксі | Android: `okhttp/3.10.0`; proxy-параметр UA | Код: F 1669–1671; M 135–136, 4913–4920. Фактичний upstream UA F не перевірено. |
| Origin / Referer | Керує WebView/браузер | Керує браузер; upstream залежить від proxy | Для API явно не задані; для site fallback задаються на Android/proxy | Код M 4922–4936. Сайт і API не слід змішувати. |
| X-Requested-With | Явно не задано | Явно не задано адаптером | Site fallback: `XMLHttpRequest` | Код M 4922–4929. Для API M такого header немає. |
| Content-Type | GET без body, явно не задано | GET без body, явно не задано | GET без body, явно не задано | Код трьох адаптерів. `dataType: text/json` визначає parsing, а не JSON-body. |
| Інші headers | Немає власних auth/cookie headers | Немає власних API headers | `params.headers` передається R/A | Реальне значення headers на дроті не виміряне. |

`crossDomain: true` не вимикає CORS. За [jQuery.ajax](https://api.jquery.com/jQuery.ajax/) headers, callbacks і timeout залежать від налаштувань/браузера; глобальні ajax-настройки інших плагінів теж можуть впливати на середовище. Z використовує `global: false`, щоб його запит не передавався стандартним глобальним AJAX-обробникам. Це не ізоляція від усіх розширень чи WebView DevTools.

Origin/Referer та UA мають браузерні обмеження; додавання headers у JS не гарантує потрібної підміни. Див. [MDN про керовані браузером headers](https://developer.mozilla.org/en-US/docs/Glossary/Forbidden_request_header). Довільний UA може вимагати серверного proxy або перевіреного native bridge; залежність Filmix від UA лишається **гіпотезою**, а не встановленою причиною.

## D. Параметри авторизації

Значення token/device ID користувачів не зчитувалися для живих тестів і не наводяться тут.

| Поле | Z | F | M | Вплив / доказ |
| --- | --- | --- | --- | --- |
| `user_dev_id` | Сталий локальний 16-hex; точний текст | Сталий `fxapi_uid` | randomHex(16), зокрема оновлюється перед profile | Код F 4–8, M 4964, 5110. Вимоги сервера до зв'язки ID/token не встановлені. |
| `user_dev_token` | Власний, порожній для гостя, encoded | Storage, конкатенація | Storage або вбудований fallback-placeholder | Код F 15–23, M 4963–4965. Значення fallback не переносилося. |
| `user_dev_name` | `Lampa` | `Xiaomi+24069PC21G` | `Xiaomi` | Код; серверна необхідність конкретної моделі — гіпотеза. |
| `user_dev_os` | `Android` | `12` | `14` | Код; не встановлено, чи сервер валідує це поле. |
| `user_dev_vendor` | `Lampa` | `Xiaomi` | `Xiaomi` | Код; вплив не перевірено. |
| `user_dev_apk` | `2.2.13` | `2.2.13` | `2.2.0` | Код; немає підтвердженої чинної серверної специфікації. |
| `app_lang` | `ru_RU` | `ru_RU` | `ru-rRU` | Код; відмінність не доводить причину збою. |
| Encoding | token/ID/story encoded | story encoded, dev-поля конкатенуються | story encoded, dev-поля конкатенуються | Код. Z захищає спеціальні символи; це не помилка, яку слід відтворювати з чужого коду. |

Для таблиці: Z `apiUrl`; F 19–23; M 131–136. Наявний код клієнтів не є офіційною специфікацією Filmix. Цільові пошуки публічної документації для `filmix.gg`/`filmixapp.cyou` не знайшли офіційної API-специфікації; це **не доказ її відсутності**.

## E. Proxy, CORS, HTTP і TLS

Z: лише налаштований користувачем HTTPS-префікс + повний upstream URL; за замовчуванням proxy порожній. Прямий HTTP відхиляється. F: типовий публічний HTTPS prefix-proxy + HTTP upstream. M: provider-specific proxy, header-параметри та `enc2t` → Base64 URL у path (`proxyLink`, 317–355); Base64 **не шифрує** token. Ці реалізації підтверджені кодом, їхня надійність і доступність — NOT VERIFIED.

Proxy бачить повний upstream запит і token, навіть якщо його адреса закодована. HTTPS до proxy не гарантує захист HTTP між proxy та Filmix. Z не додає чужий proxy, не змінює URL, не вимикає TLS і не робить HTTP fallback. Наявна опція власного proxy збережена; використовувати її з HTTP upstream/token не слід.

[Android Network Security Configuration](https://developer.android.com/privacy-and-security/security-config) впливає на довіру сертифікатам і cleartext traffic. WebView додатково має правила mixed content. Тому чужий HTTP/native сценарій не доводить придатність тієї ж адреси для нашого HTTPS/XHR.

## F. Формати та межі парсера

| Формат | Z 0.1.4 | F | M | Вплив / підтвердження |
| --- | --- | --- | --- | --- |
| Search | Array, numeric id; пошкоджені записи відкидаються | Array | Array; сайт: `posts` | Код. Live schema NOT VERIFIED. |
| Profile | `user_data` або кореневий profile | `user_data` | `user_data` | Код; права Z не змінювалися. |
| `movie` Array | Так | Так | Так | Код; локальний synthetic PASS. |
| `movie` Object | Не парситься; безпечне пояснення | Обмеження `.length` на вході | `Object.keys`/перебір | Код F 92–97, 493; M 5332–5376. Помилка клієнтського формату можлива лише після отримання post. |
| `playlist` Object | season → voice → episodes | Аналогічна карта | Аналогічний перебір | Код F 430–492; M 5255–5331. |
| Порожні Array/Object | Без playback | Порожній playlist нормалізується | Перевірка Object.keys | Код; локальні fixtures. |
| Seasons | Numeric keys, `-1` → 1 | `-1` → 1 | Numeric/fallback counters | Код; Z не розширює схеми сезонів. |
| Episodes | Numeric Object, Array; URL `sNeN` для назв | Array → 1-based map; numeric/URL | Перебір, numeric/URL/counter | Код. Значення fixtures синтетичні. |
| Voices | movie.translation / ключ voice | Фільтри голосів | Фільтри голосів | Код; новий API `voices` не вигадувався. |
| Qualities | Тільки оголошені `[q,...]` або `qualities` для `%s` | Парсинг списку; Player-map добудовує фіксовану драбину | Список/ліміт та підстановка | Код F 261–269, 549–563; M 5272–5299, 5348–5371. Добудову якостей Z не копіює. |
| Відсутні qualities | Plain URL без варіантів; bracket достатній; `%s` відхиляється | Серії очікують `.qualities.filter` | Серії очікують `.qualities.filter` | Код. Не можна припускати повну підтримку відсутніх полів у F/M. |
| Відсутній/заблокований потік | Не запускається | Є перевірки блокування | Є окрема складна логіка блокувань | Код. Обхід блокувань/секрети не переносилися. |

Fixtures: `tests/fixtures/filmix/formats.json` і README поруч. Вони створені локально з доменом `media.example`, без реальних відповідей чи приватних даних. Object movie демонструє відому межу, **не доводить**, що сервер на TCL повернув Object. Цей дефект не пояснює status 0 або помилку search: розбір post відбувається пізніше.

## Поточний шлях ZebMod і класифікація

| Функція | Поведінка / результат аудиту |
| --- | --- |
| `apiUrl()` | Перевіряє базу/proxy, кодує ID/token/story; default незмінний. Невідома exception-message тепер не виводиться; локальні відомі помилки налаштувань залишаються. |
| `Network()` | Owned XHR; search/post 15 с, profile 8 с; watchdog, generation guard, abort. JSON парситься локально з text. Metadata повертаються окремо від body. |
| `networkLog()` | Старий сумісний формат start/complete. Новий `diagnosticLog()` — окремий allowlist scalar-лог тривалості/transport. |
| `errorText()` | 401/403 → доступ; 404 → endpoint/post; 429 → ліміт; 5xx → сервер; timeout/parsererror окремі; решта — загальне підключення. |
| `request()` | Скасовує попередній запит, відкидає stale callbacks; передає санітизовану діагностику. Валідація URL не створює вигаданий HTTP-запит. |
| `fetchProfile()` | З token перед search; за помилки продовжує як гість. Діагностика profile зберігається на екрані; ручний retry знову виконує profile → search. |
| `search()` | Назва, одне original-title повторення при порожньому результаті; неочікуваний JSON-format відокремлено від синтаксичної помилки. |
| `openPost()` | Лише після вибору; парсер збережено. Unsupported movie Object пояснюється при відсутності джерел, без вигадування URL. |

HTTP status 0 — відсутній доступний HTTP-код, а не статус сервера і не конкретний діагноз. За [MDN XMLHttpRequest.status](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/status) він зустрічається до завершення й при XHR errors. Для завершеного `0/error` Z показує «Причину не визначено: можливі мережа, DNS, CORS або TLS». Timeout не доводить DNS/TLS; parsererror не доводить блокування API. Валідний JSON та схожість на Filmix — незалежні сигнали.

Для HTTP-error тіло навмисно не парситься: JSON/Filmix = unknown, навіть якщо сервер повернув JSON. Порожній search Array є валідним; успішний JSON не гарантує валідний Filmix, доступність streams чи права. Перевірка post-envelope (`player_links` Object) не означає підтримку кожного вкладеного формату.

## Android native: що встановлено і що пропонується далі

R передає `params.headers`, на Android викликає A, у браузері повертається до AJAX. A серіалізує параметри в `AndroidJS.httpReq`, потребує bridge version code ≥16; callback JSON-декодується, status/exception залежать від відповіді bridge. JS-код не підтверджує точну семантику всіх native HTTP-помилок на TCL. Браузерна CORS-політика не керує окремим native HTTP-клієнтом, але серверні обмеження/TLS залишаються.

`Reguest.clear()` очищує callbacks, не abort-ить transport. Обидві error-гілки R логують повний URL (469, 602), listeners одержують `params`; callback exceptions можуть потрапити в console/Noty. Просте перемикання на `Reguest.native()` **не є безпечним виправленням** для query-token.

Можливий наступний прототип: вузький owned wrapper без R навколо перевіреного `Lampa.Android.httpReq`, із scalar metadata, timeout/generation guard, без exception/body/URL-логів. Потрібно спершу перевірити доступність bridge, нативну реалізацію логів/TLS, status contract, cleanup/cancel і поведінку плеєра. У вивченому JS wrapper немає cancel API; до доказу протилежного можна гарантувати лише ігнорування пізніх callbacks, не фізичне скасування. Native transport у цьому випуску не ввімкнено.

## Живі мережеві результати

Windows / Node.js **v24.16.0**, 22.10.2026. Три незалежні HTTPS GET `/api/v2/search`; порожній token, синтетичний device ID, загальна назва `Test`, dev-параметри Z, публічний Origin `https://lampa.mx`. TLS validation увімкнена; redirects не виконувалися; реальні конфігурації/секрети не читалися. HTTP/native/чужі proxy не тестувалися. Тіла відповідей не виводилися та не зберігалися.

| Host | DNS IPv4 | TLS / SAN | HTTP / JSON / Filmix | Час |
| --- | --- | --- | --- | --- |
| `filmixapp.cyou` | `185.80.234.68` | FAIL `ERR_TLS_CERT_ALTNAME_INVALID`, SAN `api.filmix.tv` | До HTTP не дійшло; JSON/Filmix unknown | 90 ms |
| `filmixapp.vip` | `38.180.233.33` | FAIL `ERR_TLS_CERT_ALTNAME_INVALID`, SAN `2025.filmix.dev` | До HTTP не дійшло; JSON/Filmix unknown | 112 ms |
| `api.filmix.tv` | `185.80.234.68` | PASS для цього host, SAN `api.filmix.tv` | **405**, JSON valid, Filmix search invalid; ACAO `*` | 138 ms |

Третій host перевірено як гіпотезу з SAN, не як підтверджену заміну API. HTTPS там валідний, але GET search повернув 405; endpoint **не підтверджено придатним**. У двох TLS-failure HTTP/CORS/redirects/JSON лишаються NOT VERIFIED, не HTTP 0/200. Node не застосовує браузерний CORS; наявність ACAO `*` на одній 405-відповіді не підтверджує CORS всіх маршрутів або пошук. Інша мережа/час/пристрій можуть дати інший результат.

## Гіпотези з рівнем упевненості

| Причина | Рівень / межа | Що потрібно для підтвердження на TCL |
| --- | --- | --- |
| Невідповідний TLS-сертифікат default host | Висока для цього Windows-запиту; середня як причина TCL | Дані diagnostic 0/error + окремий WebView/network TLS evidence. Сам 0/error недостатній. |
| CORS / mixed-content / WebView policy | Можлива, не підтверджена | WebView network details після проходження TLS; origin і політика застосунку без секретів. |
| UA/device-параметри | Низька/середня гіпотеза на основі різниць коду | Контрольований guest A/B на підтвердженому HTTPS endpoint, з одним зміненим фактором. |
| DNS/доступність з мережі TV | Можлива; локальний DNS працює | Окремий read-only тест у тій самій мережі/на пристрої. |
| 401/403 / 429 / 5xx | Визначається лише при доступному status | Зняти HTTP/status, stage, kind і час у Z; не вгадувати із status 0. |
| movie Object | Підтверджене обмеження парсера, не причина search failure | Потрібний факт успішного post і його санітизованої форми; fixture не є live-доказом. |

## Локальна перевірка й ризики

Команди: `node --check lampa-online.js`; `node --test tests/lampa-online.test.cjs`; `git diff --check`. ES5 parser-тест входить у набір. Результат: **154/154 LOCAL PASS**, усі 119 попередніх збережені, 35 нових. Нові залежності не встановлювалися. Тести — VM/Lampa/jQuery/XHR mocks і синтетичні fixtures, без live HTTP.

Покрито allowlist UI/logs, elapsed, status 0/401/403/404/429/500, timeout/parsererror/abort, retry search/profile, JSON проти schema, privacy, destroy/late callbacks, Back/фокус, повторний bootstrap, джерело/Storage, формати movie/series/qualities. На справжньому телевізорі не перевірено розмір тексту, scrolling, пульт, CORS/TLS, native bridge, пошук і playback. Чужі глобальні AJAX-настройки/форки можуть змінювати поведінку. Старий префікс `LampaOnline` і старий network-log збережені для сумісності; нові scalar-логи мають окремий `diagnostic` label.

## Ручна перевірка на TCL

1. Вручну оновити опублікований JS до локального 0.1.4 і повністю перезапустити Lampa. Не завантажувати поверх старого runtime з тим самим bootstrap-прапорцем. Зберегти старі налаштування; записати модель/версії Lampa, Android, WebView.
2. Повна картка фільму → «Дивитись» → «Джерело» → ZebMod. Перевірити один пункт та доступність інших джерел. Пошук не повинен автоматично запускати Player.
3. Дочекатися помилки. Зняти **лише** stage, transport, HTTP, error, elapsed, JSON/Filmix та коротке пояснення. При 0/error записати «причину не визначено»; не називати його автоматично CORS чи TLS.
4. Натиснути рядок повтору OK: має бути один новий запит і новий час без накопичення повідомлень. Up/Down, Back → та сама картка/штатний фокус; інші джерела лишаються доступні.
5. Якщо власний token уже налаштовано, перевірити `user_profile`: його помилка залишається видимою при продовженні гостьового search. Після завершення доступний «Повторити user_profile і пошук». Перевірити Back під час цього повтору. Нових/чужих token не вводити для діагностики.
6. Якщо search успішний, вибрати результат і перевірити stage post. При movie Object очікується повідомлення про межу парсера. Серіал перевіряти окремо; успішний search/JSON ще не означає PASS playback.
7. Вийти під час запиту, повторно відкрити фільм/серіал, перезапустити Lampa. Перевірити старі налаштування, відсутність дублікатів і пізніх оновлень закритого екрана. Для відтворюваних HTTP-кодів використовувати тільки вже наявний власний тестовий endpoint, якщо він є; цей випуск не створює інфраструктури.
8. Надати санітизований результат і окремі PASS/FAIL UI, search, post, playback. Не надсилати token, device ID, cookies, headers, URL запитів чи повні API-відповіді. До цього нова діагностика/живий Filmix на TCL — **NOT VERIFIED**.

## Рекомендація для наступного ТЗ

Перший крок — отримати результат 0.1.4 з TCL і підтвердити **HTTPS API host із коректним SAN та реальною guest search-відповіддю**. Якщо проблема в сертифікаті, конкретне виправлення — коректний TLS на сервері або документовано підтверджений HTTPS endpoint; не зміна кількох device-полів навмання й не TLS bypass. Перевірити CORS/UA окремими guest A/B лише після цього.

Якщо TLS і endpoint справні, а доказ вказує на CORS/UA, наступне ТЗ може передбачити opted-in owned native wrapper або власний довірений HTTPS proxy з перевіреною політикою headers/TLS і приватності. Нормалізацію movie Object винести в окрему обґрунтовану зміну парсера з поточним fixture. Ні `api.filmix.tv`, ні `.vip`, ні чужий proxy не підставляти автоматично за цим звітом.

Git commit/push не виконувалися; `ToDo.md`, `zeb.js` та довідковий документ джерел не змінювалися.
