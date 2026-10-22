# ZebMod v0.1.5 — Rezka experimental

Дата перевірки: **2026-10-22**, Windows / Node.js, звичайна перевірка системного TLS. Це реалізація ТЗ №6 з актуального кореневого `ToDo.md`.

**Результат: підготовлено ізольований експериментальний адаптер. Працездатність Rezka search/detail/episodes/stream та відтворення на TCL НЕ ПІДТВЕРДЖЕНІ. Публікувати 0.1.5 як перевірену інтеграцію Rezka зарано.** HTTP 200 головної сторінки виявився anti-bot HTML, а не каталогом. Використано дозволений розділом 14 ТЗ експериментальний варіант; обмеження показано й у виборі провайдера.

## Реальна попередня перевірка

| Перевірка `https://rezka.ag/` | Спостереження | Висновок |
| --- | --- | --- |
| DNS | IPv4 `179.43.189.162` | NETWORK VERIFIED для середовища Windows; адреса може змінюватися |
| TLS / SAN | Перевірка сертифіката ввімкнена, з'єднання authorized; SAN `DNS:*.rezka.ag, DNS:rezka.ag`; notAfter `Dec 16 02:57:56 2026 GMT` | HTTPS PASS у цьому середовищі |
| Звичайний GET `/` | HTTP **200**, `text/html; charset=utf-8` | Сервер відповідає, доступ до контенту не доведено |
| Редирект головної | Немає, автоматичне проходження редиректів вимкнено під час preflight | Домен не підмінявся |
| Декодований HTML | 7722 байти; title «Проверяем, что вы не бот!»; ресурси `/.within.website/…` | **Anti-bot challenge**, каталогу немає |
| CORS | На цій відповіді немає `Access-Control-Allow-Origin` | Головна не підтверджує працездатність cross-origin WebView AJAX; заголовки search можуть відрізнятися |
| Cookies / облікові дані | Не імпортувалися і не надсилалися; відповіді Set-Cookie не відтворювалися | Лише гостьова перевірка |

Зроблено два звичайні GET головної: другий уточнював формат стисненого тіла. Сервер повертав gzip; оцінка HTML/challenge зроблена **після розпакування**, не за стисненими байтами. Після розпізнавання challenge жодного запиту пошуку, detail або CDN AJAX до Rezka не виконували. JS challenge не запускався. Не підбирали User-Agent, дзеркала, cookies, CAPTCHA-рішення чи проксі.

Це не доказ, що гостьового доступу не існує в інших умовах. Це також не дозвіл обходити захист. Підтверджений мережевий результат обмежується DNS, TLS і заблокованою головною сторінкою.

## Статичні джерела та Lampa API

Чужі плагіни завантажувалися лише як текст поза репозиторієм; їх не виконували, не встановлювали й не переносили цілком. Приклади контрактів нижче — **статичні**, не фактичні відповіді каталогу цього дня.

- [nb557 online_mod.js, commit 9fbcac14ef8331ca8026a486e92c1a7f59220756](https://github.com/nb557/plugins/blob/9fbcac14ef8331ca8026a486e92c1a7f59220756/online_mod.js): `rezka2()` від рядка 1637; `query_search` 1930–1955, `getPage` 2016–2032, `extractData` 2046–2158, `getEpisodes` 2162–2195, `extractEpisodes` 2198–2229, `getStream` 2288–2349. Перевірено маршрути, POST-поля, назви HTML-класів, числові аргументи init-викликів і JSON-поля. Декодер прихованих посилань, cookies, авторизація та proxy-логіка не переносилися.
- [datalabMD/lampa-plugins, commit 7f81508719fc274a9bca6b2eaf13d4167fe1e3d7](https://github.com/datalabMD/lampa-plugins/tree/7f81508719fc274a9bca6b2eaf13d4167fe1e3d7): статично переглянуто `rezka.js`, відкриті маршрути/парсери `rezka2.js`, зовнішню структуру `rezka4.js` та `proxy_README.md`. Приклад використовує інший домен і сторонній проксі, включно з авторизацією. Це **не доказ прямого гостьового доступу до rezka.ag**. Секрети/проксі/дзеркала не копіювалися; обфускований код не декодувався.
- Lampa перевірено за commit `71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2`: [Activity](https://github.com/yumata/lampa-source/blob/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/interaction/activity/activity.js), [Controller](https://github.com/yumata/lampa-source/blob/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/core/controller.js), [Scroll](https://github.com/yumata/lampa-source/blob/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/interaction/scroll.js), [Player](https://github.com/yumata/lampa-source/blob/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/interaction/player.js), [Reguest](https://github.com/yumata/lampa-source/blob/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/utils/reguest.js), [Android](https://github.com/yumata/lampa-source/blob/71733ed81f4b13ac1ed1b3328cbbaa7e01afdbd2/src/core/android.js). Це аудит конкретного вихідного коду, а не встановленої на TCL збірки.

## Маршрути й контракт експериментального адаптера

| Етап | Запит | Розпізнавана відповідь | Статус живої перевірки |
| --- | --- | --- | --- |
| preflight | GET `https://rezka.ag/` | Отримано challenge HTML | NETWORK VERIFIED лише блокування |
| search | POST `/engine/ajax/search.php`, form-urlencoded: `q` | HTML `li > a` з `.enty`; або відомі catalog-блоки `.b-content__inline_item-link`; окрема ознака порожнього пошуку | **NOT VERIFIED** |
| альтернативний штатний пошук | GET `/search/?do=search&subaction=search&q=…&page=…` у статичному джерелі | Каталожний HTML | **NOT VERIFIED**, не використовується як автоматичний fallback |
| detail | GET обраного вручну same-origin HTTPS `…/id-title.html` | `h1`, статичні числові аргументи `.initCDNMoviesEvents(id,translator,camrip,ads,director,…)` або `.initCDNSeriesEvents(id,translator,season,episode,…)`; `.b-translator__item` | **NOT VERIFIED** |
| episodes | POST `/ajax/get_cdn_series/`, поля `id`, `translator_id`, `favs`, `action=get_episodes` | JSON Object, `seasons` і `episodes` — HTML-рядки з `.b-simple_season__item[data-tab_id]` та `.b-simple_episode__item[data-season_id][data-episode_id]` | **NOT VERIFIED** |
| stream, фільм | POST того самого маршруту, `id`, `translator_id`, `favs`, `action=get_movie`, `is_camrip`, `is_ads`, `is_director` | JSON Object з `url`; `success:false` відхиляється, `premium_content` зупиняє сценарій | **NOT VERIFIED** |
| stream, серіал | POST того самого маршруту, `id`, `translator_id`, `favs`, `action=get_stream`, `season`, `episode` | Та сама JSON-оболонка | **NOT VERIFIED** |

Content-Type POST: `application/x-www-form-urlencoded; charset=UTF-8`. Обробка jQuery form encoding. `favs` береться тільки з обмеженого значення hidden `ctrl_favs` поточної сторінки, не з конфігурації користувача; не виводиться в UI чи логи. Немає вигаданих client token, Device ID або спеціальних заголовків. Origin/Referer/User-Agent визначає WebView; JS не намагається підробити заборонені заголовки. Вимогу спеціальних headers на справжньому Rezka не підтверджено. Timestamp `?t=…` зі стороннього прикладу не визнано необхідним параметром і не додається.

Підтримуються **лише явні** HTTPS MP4/HLS URL або списки `[720p]https://…mp4,[1080p]https://…m3u8`. Варіанти `or` показуються окремо. Якість не виводиться з припущення, не підставляється в URL-шаблон, відсутня роздільність позначається «Якість джерела». Непідтримувані схеми, credentials в адресі, нестандартні порти, IP/IPv6 та нестандартні host-и, fragments, control characters, HTML/embed, DASH, шаблони й `#`-закодовані відповіді відхиляються. Обмежений парсер не є універсальним URL/HTML-парсером; невідома розмітка завершується діагностикою. Реальну наявність файлу, кодеки, термін дії signed URL і відсутність редиректу медіасервера локальна валідація **не доводить**.

## Архітектура й навігація

Єдина кнопка **ZebMod** і контекстний `onContextLauch` відкривають `lampa_online_provider_screen`: **Rezka**, потім **Filmix**. Повна `movie` передається в кожний `Activity.push` без втрати полів. Filmix запускає початковий `lampa_online_filmix_screen`; тіло `FilmixScreen`, Filmix network/quality/Player-алгоритми не змінені. Новий адаптер — `lampa_online_rezka_screen`, зі своїм transport та lifecycle. Додаткових налаштувань немає: чотири Filmix settings і старі Storage keys збережено.

Пошук використовує назву картки; title/name/original_title/original_name беруть участь у ранжуванні, рік — у порівнянні. Окремий рядок дозволяє користувачеві явно повторити пошук оригінальною назвою. Збіг не вважається достатнім для автоматичного відкриття або playback. Непідтверджених автоматичних fallback-запитів немає.

Фільм: результати → озвучення → отримані якості → Player. Серіал: результати → озвучення → сезони → серії → отримані якості → Player. Сезони/серії сортуються чисельно. Back скасовує поточний запит і повертає попередній збережений екран/рядок без повторного HTTP; з кореня повертає Activity. Up/Down/Right передаються Navigator, Left — Navigator або меню Lampa. `hover:enter` використовує штатні події OK/touch хоста; власного глобального touch/Back interception немає.

`Player.play()` / `Player.playlist()` викликаються лише після вибору якості. Плейлист містить **один фактично отриманий потік обраної серії/фільму**. Автоматичного переходу до наступної серії немає: її URL не отримували. Player і глобальні методи Lampa не перевизначаються.

## Transport, privacy та Android

| Варіант | Що перевірено | Рішення / обмеження |
| --- | --- | --- |
| WebView AJAX | Контракт jQuery, власний XHR.abort, timeout, fixtures; головна не надала CORS allow-origin | Єдиний **експериментальний** transport. Успішний cross-origin запит на TCL не підтверджено |
| `Lampa.Reguest.native` | Статичний код може логувати URL/помилки, `clear()` не доводить фізичне скасування HTTP | Не використовується; не видається за перевірений спосіб подолати CORS |
| `AndroidJS.httpReq` через Android | Bridge залежить від версії Android-обгортки; у перевіреному коді `checkVersion(16)` | На TCL не перевірено TLS, cookies, headers, redirect, cancellation і приватність; пряме використання не додано |
| Власний довірений gateway, лише за окремим майбутнім рішенням | У цій версії відсутній | Потребує адміністрування/TLS/захисту від SSRF і правил логування; оператор бачить IP, пошуки та можливі підписані URL. Не має обходити challenge/авторизацію |

Rezka має незалежний cancellable AJAX, `global:false`, `crossDomain:true`, `withCredentials:false`, watchdog 15 секунд, generation-перевірку проти пізніх callbacks і idempotent destroy. Back/retry очищують власний запит і таймер. Не використовуються Filmix proxy/token/device ID. Cross-origin cookies не запитуються; довільні глобальні `$.ajaxSetup`, same-origin розміщення Lampa, модифікований WebView або оболонка можуть змінити транспортну поведінку — це потребує перевірки конкретного пристрою. Окремого cookie jar/сесії входу немає.

Діагностика показує лише фіксовані `provider`, `stage`, `transport`, числові HTTP/elapsed, allowlisted `error`, response type і коротке пояснення. Відокремлено status 0, timeout, 401/auth, 403/429/anti-bot, 404, 5xx, parser, empty results, absent/encoded stream і Player. Повні URL, cookies, headers, відповіді сервера та exception messages не відображаються і не логуються. Rezka не створює зовнішнього або консольного мережевого журналу. Скасування через Back/destroy мовчазне; зовнішній abort видимого запиту має окрему діагностику. Жоден raw HTML не передається в `$()`, DOMParser чи document: витягуються лише відомі статичні поля, UI будується через `.text()`.

Android WebView може блокувати CORS або мати інше сховище CA; status 0 не визначає причину. Playable URL ще не означає підтримку кодека/HLS зовнішнім плеєром. Керування фокусом, touch і повідомлення зовнішнього Player потребують TCL-перевірки. TLS не вимикається; HTTP fallback, публічних проксі, автоматичного дзеркала, логіна/пароля, cookie-import або декодування захищених потоків немає.

## Перевірки та готовність

| Перевірка | Статус |
| --- | --- |
| 154 попередні тести | **LOCAL PASS**; оновлено лише очікування версії/публічного picker/кількості компонентів відповідно до ТЗ |
| 58 нових тестів Rezka/provider, синтетичний `tests/fixtures/rezka-formats.json` | **LOCAL PASS** |
| `node --check lampa-online.js`, `node --test`, Acorn ES5 check усередині suite, `git diff --check` | **LOCAL PASS** |
| DNS/TLS/HTTP головної та anti-bot HTML | **NETWORK VERIFIED**, доступ до каталогу заблоковано |
| search | **NOT VERIFIED** реально; **LOCAL PASS** fixtures |
| detail | **NOT VERIFIED** реально; **LOCAL PASS** fixtures |
| episodes | **NOT VERIFIED** реально; **LOCAL PASS** fixtures |
| stream / реальний Player playback | **NOT VERIFIED**; URL з fixtures — синтетичні |
| Android TV / TCL | **TCL VERIFIED: NOT VERIFIED**, пристрій у цій роботі не керувався |

212 тестів охоплюють picker/повну картку/Filmix, matching і роки, HTML/JS safety, numeric IDs, голоси, сезони/серії, MP4/HLS/якості, URL rejection, anti-bot/auth, HTTP errors, timeout/retry, Back/focus, lifecycle, пізні responses/Player errors, відсутність дублікатів і збереження налаштувань. Mocks не виконують справжню Lampa/WebView і не доводять network playback.

## Ручна перевірка на TCL

1. Для контрольного тесту вручну розмісти локальний `lampa-online.js` на власному URL і повністю перезапусти Lampa. `zeb.js` автоматично не змінювався. Зафіксуй версії Lampa, Android, WebView та плеєра. Очікуваний bootstrap-log — `LampaOnline v0.1.5.ready`.
2. Відкрий стандартну «Дивитись → Джерело»: рівно один ZebMod, інші джерела залишилися. OK відкриває Rezka першою, Filmix другою. Перевір D-pad/Left/Right/touch і Back до картки. Обери Filmix і перевір попередній екран/діагностику, старі settings, їх збереження після перезапуску.
3. Для фільму й серіалу окремо обери Rezka. Перевір назву поточної картки. При challenge/403/авторизації **зупини цей мережевий сценарій**, запиши лише provider/stage/transport/HTTP/error/elapsed/type. Не вирішуй CAPTCHA, не імпортуй cookies й не перемикай проксі для обходу. Status 0 сам по собі не називай CORS/TLS.
4. Лише якщо отримано звичайний дозволений гостьовий search: перевір кілька результатів/роки та ручний вибір; за потреби явний пошук оригінальної назви. Після detail обери озвучення. Для серіалу перевір числовий порядок сезонів/серій. Не вважай HTTP 200 достатнім PASS.
5. Якщо штатний stream-запит повернув підтримуваний відкритий URL: обери отриману якість, перевір реальне відео/звук і Back із вбудованого та потрібного зовнішнього Player. Очікується тільки поточний елемент playlist; наступний епізод обирається вручну. Encoded/premium/restricted response має завершитися поясненням, без обходу.
6. Перевір Back під час search/detail/episodes/stream, потім повторне відкриття тієї ж та іншої картки. Пізні відповіді не мають змінювати закритий екран. Перевір retry після звичайної мережевої помилки, відновлення фокуса, відсутність подвійних OK/джерел, збереження Filmix settings.
7. Передавай тільки sanitized metadata й окремі PASS/FAIL/NOT VERIFIED для UI, search, detail, episodes, stream, реального playback та Filmix regression. Не передавай приватні URL, response bodies, cookies або облікові дані.

**Рекомендація щодо публікації:** локальна 0.1.5 придатна для контрольної перевірки як **experimental**, але підстав для публікації як працездатного Rezka-релізу немає. Потрібні успішні реальні гостьові search/detail/stream без обходу захисту та TCL-навігація/playback. Commit, push і автоматичне оновлення `zeb.js` не виконувалися; `ToDo.md` збережено.
