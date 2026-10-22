# ТЗ №5 — перевірка HTTPS endpoints Filmix API v2

Дата: **22 жовтня 2026 року**, Europe/Warsaw. Середовище живих проб: **Windows / Node.js v24.16.0**. Початкова серія виконана о 19:18 UTC / 21:18 Warsaw; наступні контрольні запити — у тій самій сесії.

## Результат: B. Безпечний HTTPS endpoint не підтверджено

Серед чотирьох обґрунтованих кандидатів не отримано жодної успішної реальної Filmix search-відповіді. Два host мають невідповідний TLS SAN; два інші проходять TLS, але потрібні API-маршрути повертають 405 або HTML 404. Зміни перевірених User-Agent, headers, device-профілів і розміщення порожнього token результат не виправили.

**Рекомендація:** не змінювати `API_DEFAULT` у ZebMod. Залишити 0.1.4 та діагностику; отримати від провайдера/підтвердженого джерела HTTPS API v2 із коректним сертифікатом і перевірити реальний search перед інтеграцією. Це висновок про досліджені кандидати в цьому середовищі, а не доказ відсутності будь-якого іншого HTTPS API у світі.

## Вхідний результат TCL

Користувач надав для ZebMod 0.1.4: `stage=search`, `transport=WebView AJAX`, `HTTP=0`, `error=error`, `elapsed=369 ms`, `JSON=unknown`, `Filmix=unknown`.

Це підтверджує невдалий XHR із недоступним HTTP-статусом. **369 ms і status 0 не встановлюють конкретно TLS, DNS або CORS.** Виявлений нижче TLS mismatch default host — сильна технічна гіпотеза для TCL, але доказ отримано у Windows. Нових запитів із самого TCL, перевірки його native bridge або відтворення в цьому завданні не було.

## Джерела і вибір кандидатів

Прочитано `docs/Filmix_API_Diagnostics.md`, `docs/Lampa_External_Plugin_References.md` та поточний `lampa-online.js`. Попередні Windows-результати повторно перевірено, а не прийнято як поточні за замовчуванням.

Додаткова реалізація: [n0madic/go-filmix](https://github.com/n0madic/go-filmix/tree/32e4e4f522537943a035ddf1be303782e0b7f6d0), поточний master під час аналізу — commit `32e4e4f522537943a035ddf1be303782e0b7f6d0`. Вивчено текст `client/discover.go`, `client/client.go`, `internal/httpx/url.go`, `internal/httpx/client.go`, `options.go`, `models/search.go`, `models/error.go` і відповідні client/discover tests. Go-клієнт не встановлювався й не запускався, його auth/session store не читався.

| Кандидат | Чому перевірявся |
| --- | --- |
| `https://filmixapp.cyou/api/v2/` | `API_DEFAULT` ZebMod; HTTPS-кандидат у [go-filmix discovery](https://github.com/n0madic/go-filmix/blob/32e4e4f522537943a035ddf1be303782e0b7f6d0/client/discover.go). |
| `https://filmixapp.vip/api/v2/` | HTTPS-варіант host, який використовує `fx.js`; схема HTTPS перевіряється окремо, а не припускається працездатною за HTTP-прикладом. |
| `https://api.filmix.tv/api/v2/` | SAN сертифіката, отриманого від default host; лише гіпотеза про API alias. |
| `https://2025.filmix.dev/api/v2/` | SAN сертифіката, отриманого від `.vip`; лише гіпотеза про API alias. |

У `go-filmix` default discovery **не містить нового host**: тільки HTTP та HTTPS варіанти `.cyou`. HTTP-кандидат тут не викликався. Сайти `filmix.gg`/`filmix.my` не вважалися автоматично API v2; їхні вебсценарії й password/cookie login не запускалися. Цільовий вебпошук додаткових Filmix API v2 адрес не дав іншого підтвердженого кандидата для цієї перевірки. Blind DNS/subdomain/path перебір не виконувався.

## Що дає аналіз go-filmix

1. [Discovery](https://github.com/n0madic/go-filmix/blob/32e4e4f522537943a035ddf1be303782e0b7f6d0/client/discover.go) робить GET `check_update` з device-параметрами. Коментар попереджає про можливий 400 без fingerprint, але це твердження автора клієнта, а не результат наших поточних серверних проб.
2. Його health-check перевіряє HTTP 200 та наявність текстового маркера `"version"` у перших 4096 bytes. Це слабший тест, ніж повний JSON/schema плюс реальний search; один marker не є доказом справного API.
3. [APIClient.Search](https://github.com/n0madic/go-filmix/blob/32e4e4f522537943a035ddf1be303782e0b7f6d0/client/client.go) використовує GET `search`, параметр `story`, і декодує Array записів пошуку. [SearchResult](https://github.com/n0madic/go-filmix/blob/32e4e4f522537943a035ddf1be303782e0b7f6d0/models/search.go) має `id`, `title`, `original_title`, `year`, `section`, `alt_name`.
4. [URL builder](https://github.com/n0madic/go-filmix/blob/32e4e4f522537943a035ddf1be303782e0b7f6d0/internal/httpx/url.go) кодує ID і device-поля; за порожнього token взагалі не додає `user_dev_token`. `app_lang` сам не додає. ZebMod додає обидва поля; перевірено обидва guest-варіанти.
5. [Defaults](https://github.com/n0madic/go-filmix/blob/32e4e4f522537943a035ddf1be303782e0b7f6d0/options.go): name `go-filmix`, vendor `Xiaomi`, OS `11`, APK `2.0.9`; звичайний Go HTTP client. В API-запитах немає власного обов'язкового Authorization, cookie, Origin чи Referer header.

Це сторонній клієнт, не офіційна специфікація Filmix. Його історичні коментарі й mocks не підтверджують поточну доступність API. Його logger теж не переносився: token-redaction сама по собі не прибирає device ID та інші query-поля.

## Методика та критерії PASS

- Всі мережеві запити виконано власним коротким Node HTTPS probe; TLS chain і hostname перевіряються штатним Node/OpenSSL (`rejectUnauthorized: true`). Власний `checkServerIdentity`, підміна Host/SNI, direct-IP обходи, `-k`/insecure та додаткові trust exceptions не використовувалися.
- Пряме HTTPS-з'єднання, без proxy; redirects не виконуються, HTTP не викликається. Кожен запит має 8 s socket timeout та 10 s watchdog, body limit 2 MB.
- DNS — системний `dns.lookup(..., {all:true})`; усі отримані в цій сесії адреси були IPv4. Це не глобальний аудит DNS або доказ відсутності IPv6 у всіх resolver.
- Для **всіх** API-проб використано один синтетичний 16-hex Device ID. Token завжди порожній: явний порожній параметр або його відсутність. Реальні налаштування користувача, token, cookies, пароль чи сесія не читалися й не передавалися.
- Search-query — загальна назва `Interstellar`. Жодного stream/post download або playback не виконувалося. Повні request URL/query, raw API body, cookies й приватні headers не виводилися та не зберігалися. Збережені лише санітизовані metadata, body SHA256 та публічні TLS-сертифікати.
- **HTTPS PASS**: успішне штатне TLS-з'єднання з цільовим hostname. Чинний сертифікат іншого домену — FAIL.
- **JSON PASS**: повне отримане тіло успішно розбирається JSON.parse; HTML або порожнє тіло — FAIL.
- **check_update schema PASS**: root Object із версією у форматі `N.N[.N...]`, без error-envelope. Це структурна впізнаваність, не атестація провайдера.
- **search schema PASS**: непорожній Array, усі записи з додатним numeric `id`, непорожнім `title` та хоча б одним із `original_title`/`year`/`alt_name`. Порожній Array не вважається достатнім позитивним доказом працездатності для цього дослідження.
- Рекомендація API потребує **2xx + коректний TLS + реальний впізнаваний search**, а для поточного AJAX ще окремої перевірки CORS/WebView. HTTP 200, валідний JSON error-envelope чи `Access-Control-Allow-Origin: *` окремо недостатні.

## DNS і TLS/SAN

| Host | DNS IPv4 | HTTPS | Subject/SAN | Чинність сертифіката, UTC |
| --- | --- | --- | --- | --- |
| `filmixapp.cyou` | `185.80.234.68` | **FAIL**, `ERR_TLS_CERT_ALTNAME_INVALID` | CN/SAN `api.filmix.tv` | 09.10.2026 17:32:11 — 07.01.2027 17:32:10 |
| `filmixapp.vip` | `38.180.233.33` | **FAIL**, `ERR_TLS_CERT_ALTNAME_INVALID` | CN/SAN `2025.filmix.dev` | 30.09.2026 08:31:20 — 29.12.2026 08:31:19 |
| `api.filmix.tv` | `185.80.234.68` | **PASS**, TLS 1.3 | CN/SAN `api.filmix.tv` | 09.10.2026 17:32:11 — 07.01.2027 17:32:10 |
| `2025.filmix.dev` | `38.180.233.150` | **PASS**, TLS 1.3 | CN/SAN `2025.filmix.dev` | 30.09.2026 08:31:20 — 29.12.2026 08:31:19 |

Issuer CN обох сертифікатів — `YE2`. SHA256 fingerprints:

- `api.filmix.tv`: `F7:4B:76:DE:23:C6:89:A4:3C:36:A5:54:CF:CD:C2:FA:84:2C:68:D4:CD:68:91:15:24:F4:3A:E5:84:61:4C:6C`.
- `2025.filmix.dev`: `C9:2F:42:44:59:C0:8C:7E:04:5E:DB:D1:8C:DC:A3:71:96:BF:C6:12:31:91:FB:81:BA:F9:45:23:4B:5A:95:EB`.

Дата сертифіката не є проблемою цих двох FAIL: не збігається саме hostname. Правильний SAN у кандидата з іншою адресою не доводить, що його application routes є потрібним Filmix API.

## Основна матриця: GET /api/v2/check_update та /api/v2/search

Базова серія: device-профіль go-filmix, `User-Agent: Go-http-client/1.1`, `Accept: */*`, без Origin/Referer, token відсутній/порожній. По одному запиту кожного маршруту на кожен host.

| HTTPS база | `/check_update`: HTTP / JSON / schema | `/search`: HTTP / JSON / schema | Рекомендувати для ZebMod? |
| --- | --- | --- | --- |
| `filmixapp.cyou/api/v2/` | HTTP не отримано / NOT VERIFIED / NOT VERIFIED | HTTP не отримано / NOT VERIFIED / NOT VERIFIED | **Ні: TLS FAIL** |
| `filmixapp.vip/api/v2/` | HTTP не отримано / NOT VERIFIED / NOT VERIFIED | HTTP не отримано / NOT VERIFIED / NOT VERIFIED | **Ні: TLS FAIL** |
| `api.filmix.tv/api/v2/` | **405 / PASS / FAIL** | **405 / PASS / FAIL** | **Ні: немає успішного Filmix search** |
| `2025.filmix.dev/api/v2/` | **404 / FAIL / FAIL** | **404 / FAIL / FAIL** | **Ні: маршрути повертають HTML** |

Для TLS FAIL JSON/schema позначено NOT VERIFIED, а не штучним FAIL: HTTP-тіла не отримано. Це також **не HTTP status 0** — у Node до HTTP не дійшло; status 0 із TCL є іншим, браузерним сигналом.

Додаткові факти базової серії:

| Host | Content-Type | Тіло / контроль | CORS / методи | Час check_update / search |
| --- | --- | --- | --- | --- |
| `.cyou` | Недоступний | TLS stopped | Недоступні | 112 / 97 ms |
| `.vip` | Недоступний | TLS stopped | Недоступні | 102 / 100 ms |
| `api.filmix.tv` | `application/problem+json` | 104 bytes, root error Object; відсутня version, немає search Array | ACAO `*`; `Allow` відсутній | 153 / 143 ms |
| `2025.filmix.dev` | `text/html` | HTML 404, приблизно 148 KB | ACAO не виявлено | 299 / 293 ms |

`api.filmix.tv` повертає однакову JSON-помилку з числовим code 405 і категорією повідомлення «method»; повний текст відповіді не зберігався. SHA256 цього 104-byte body: `7ca8c635f108160c5b58b0b183210160166961113cd0c236540deaf8cdbcb57a`. Такий об'єкт не є відповіддю потрібного Filmix API route. CORS header на error-відповіді не доводить роботу search. Node не застосовує браузерну CORS-політику.

## Контроль HTTP headers і параметрів

Взято лише відкриті несекретні device-поля з досліджених реалізацій. Synthetic ID незмінний, token порожній; чужі fallback-token не використовувалися.

| Профіль | name / vendor / OS / APK | app_lang | token query |
| --- | --- | --- | --- |
| Z | `Lampa` / `Lampa` / `Android` / `2.2.13` | `ru_RU` | present-empty |
| G | `go-filmix` / `Xiaomi` / `11` / `2.0.9` | Відсутній | Omitted |
| M | `Xiaomi` / `Xiaomi` / `14` / `2.2.0` | `ru-rRU` | present-empty |
| F | `Xiaomi 24069PC21G` / `Xiaomi` / `12` / `2.2.13` | `ru_RU` | present-empty |

Header-профілі:

- **Browser-like:** публічний Chrome 153 Windows UA, `Origin: https://lampa.mx`, `Accept: text/plain, */*; q=0.01`. Це емуляція headers у Node, **не запуск реального WebView**. Referer не задавався.
- **Go:** `User-Agent: Go-http-client/1.1`, `Accept: */*`, без Origin/Referer.
- **OkHttp-like:** `User-Agent: okhttp/3.10.0`, `Accept: application/json`, без Origin/Referer. Це не нативний Android transport, а контроль UA в Node.

На **обох** TLS-valid host перевірено обидва маршрути для Z/Browser-like, Z/OkHttp-like, G/OkHttp-like, M/OkHttp-like та F/OkHttp-like — 20 додаткових GET. Результат незмінний: `api.filmix.tv` завжди **405 / JSON PASS / schema FAIL**, `2025.filmix.dev` завжди **404 / JSON FAIL / schema FAIL**. Ці агреговані профілі змінюють кілька полів; вони не встановлюють необхідність конкретного поля.

Окремий однофакторний контроль на `api.filmix.tv` для обох routes, відносно Z/Browser-like:

| Єдина зміна | check_update | search |
| --- | --- | --- |
| Лише User-Agent → `okhttp/3.10.0` | 405 / JSON PASS / schema FAIL | Те саме |
| Лише вилучити Origin | 405 / JSON PASS / schema FAIL | Те саме |
| Додати `X-Requested-With: XMLHttpRequest` | 405 / JSON PASS / schema FAIL | Те саме |
| Додати `Content-Type: application/json`, GET без body | 405 / JSON PASS / schema FAIL | Те саме |
| Лише вилучити порожній token query | 405 / JSON PASS / schema FAIL | Те саме |

Усі 10 відповідей мали той самий наведений SHA256. Отже, **жоден із перевірених headers/профілів не підтверджений як виправлення**. Це не означає, що сервер ніколи не потребує інших документованих параметрів; такої специфікації у вивчених джерелах не знайдено. Headers не можуть виправити hostname mismatch: HTTP починається після перевірки TLS.

## Чи означає 405, що потрібен POST?

Відповіді не містили `Allow` або розпізнаної підказки supported methods. Двома повторними GET це перевірено окремо. Щоб не зробити непідтверджений висновок «просто замінити GET на POST», на `api.filmix.tv` виконано шість контрольних запитів **лише read-only операцій** `check_update` і `search`, з synthetic ID/empty token:

| Метод і передача параметрів | check_update | search |
| --- | --- | --- |
| OPTIONS, query | **200**, 0 bytes, JSON FAIL, schema FAIL | Те саме |
| POST, query, порожній body | **405**, JSON PASS, schema FAIL | Те саме |
| POST, `application/x-www-form-urlencoded` body | **405**, JSON PASS, schema FAIL | Те саме |

POST 405 має той самий 104-byte hash. OPTIONS 200 — порожня службова відповідь, **не позитивний API health-check**. Тому ані зміна методу, ані звичайне переміщення device-параметрів у body не дали робочий endpoint. Немає підстав переносити ці експерименти у ZebMod.

## Обмеження висновку

Проведено 44 збережені санітизовані результати проб (8 baseline, 20 profile/header, 6 method, 10 однофакторних) та два повторні GET для перевірки method hint. Не було TLS bypass, HTTP fallback, proxy, login/token_request, користувацьких credentials або playback. Сторонні програми не запускалися. Raw bodies оброблялися лише в пам'яті для JSON/schema/hash; у файлах залишилися metadata, не відповіді API.

Це результати однієї Windows-мережі/моменту; DNS, routing, доступність або регіональні правила можуть відрізнятися на TCL. Публічний TLS-сертифікат підтверджує hostname за стандартною PKI, але не сам по собі офіційне походження API чи його сумісність із Filmix v2. Навіть майбутній успішний search у Node не підтвердить CORS/WebView і playback на TCL.

Для відтворюваності: SHA256 локально написаного тимчасового probe — `c33d8a3a7987a5b5e8147cce89b22698781a6e7b9efdb4704880fdcaebc5e5ee`. Використано лише стандартні Node HTTPS/DNS/crypto/fs, без залежностей; записи містять stage/profile/method, TLS/SAN, status, JSON/schema, кількість/тип результатів і hash без приватного body. Probe і metadata залишені у тимчасовому каталозі середовища, не включені в плагін і не є зовнішнім сервісом збору логів.

## Архітектурні варіанти для Android у випадку B

| Варіант | Що дає | Межі й конфіденційність |
| --- | --- | --- |
| Прямий HTTPS WebView AJAX до підтвердженого API | Зберігає поточну архітектуру | Потрібні коректні TLS та CORS. При неправильному SAN має виправлятися сервер/підтверджуватися інший endpoint. UA/політики WebView обмежені; URL у DevTools/локальних логах потребують захисту. |
| Owned Android native HTTPS wrapper | Можливість задавати UA, окремий HTTP-клієнт без браузерного CORS | **Не виправляє TLS mismatch, 404 чи 405.** Потрібна перевірка сертифіката, bridge availability/version, status mapping, timeout/cancel і native-логів. У перевіреній Lampa `Reguest.native()` логує query URL; його не можна просто ввімкнути для token. Виклик нижчого bridge теж потребує privacy-аудиту. У браузері цей шлях може бути відсутній. |
| Власний довірений HTTPS gateway | Контроль CORS/UA та політики логування на власному сервері | Потрібен уже підтверджений upstream; gateway не робить неправильний upstream TLS безпечним. Token/ID доступні власнику gateway: потрібні redaction, відсутність query/access-логів, обмеження доступу, оновлення й normal TLS на обох ділянках. Це майбутній варіант, **інфраструктуру не створювали**. |

Контракти native описані у [Lampa Reguest](https://github.com/yumata/lampa-source/blob/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/utils/reguest.js) та [Android wrapper](https://github.com/yumata/lampa-source/blob/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/core/android.js), зіставлених у попередньому звіті. Там `clear()` лише відкидає callbacks; фізичне скасування native-запиту не гарантоване. [Android network security configuration](https://developer.android.com/privacy-and-security/security-config) додатково визначає довіру сертифікатам і cleartext policy.

Native HTTP або HTTP upstream через HTTPS gateway не відповідає меті безпечного наскрізного HTTPS. Для token це неприйнятний шлях; навіть гостьовий запит розкриває пошукові запити та ідентифікатор і допускає підміну відповіді. Публічні сторонні CORS-proxy та Host/SNI/TLS обходи не рекомендуються.

**Порядок наступної роботи:** отримати підтверджений HTTPS API маршрут → guest `check_update` та непорожній впізнаваний search → CORS/WebView тест на TCL → лише за доведеної CORS/UA проблеми розглядати opted-in native wrapper. Playback перевіряти окремо після успішного search/post. До цього **Filmix API не оголошується виправленим**.

## Зміни репозиторія

Додано тільки цей документ. `lampa-online.js`, `API_DEFAULT`, Player, інтерфейс, версія 0.1.4, налаштування, `ToDo.md` та `zeb.js` залишені без змін. SHA256 основного JS під час перевірки: `82896bdfe22a78f3ca845b3fb414dca7383e957188130cfb0360d3f82cdeafaf`. Git commit/push не виконувалися.
