
# Lampa - Plugin Development

## Призначення та структура

Розробка, модифікація, тестування й налагодження зовнішніх JavaScript-плагінів Lampa. Поточний плагін ZebMod (попередня назва Lampa Online) — самодостатній `lampa-online.js`: bootstrap, manifest/settings, одна кнопка джерела, вибір провайдера та незалежні Filmix/Rezka екрани. Rezka позначена experimental; працездатність провайдерів не випливає з наявності коду.

- `README.md` — основний опис ZebMod, архітектура, встановлення, налаштування, історія версій, відомі обмеження й ручне тестування.
- `docs/` — технічна документація Lampa, довідкові матеріали, результати дослідження Filmix/Rezka та зовнішні технічні джерела.
- `tests/lampa-online.test.cjs` — offline `node:test`, VM і mocks Lampa/jQuery/XHR; `tests/fixtures/filmix/` та `tests/fixtures/rezka-formats.json` — синтетичні дані.
- Build system, `package.json` і npm scripts тут відсутні. `.gitignore` виключає `ToDo.md`.
- Для робіт із плагінами застосовуй [lampa-plugin-development](.agents/skills/lampa-plugin-development/SKILL.md).

## Обсяг роботи та документація

Поточне завдання користувача визначає обсяг змін. Якщо воно посилається на `ToDo.md`, прочитай файл повністю; не запускай попереднє ТЗ автоматично. Змінюй лише потрібні файли, зберігай сторонні незавершені зміни. Не редагуй `ToDo.md` без прямої вказівки.

Обирай документи за індексом нижче, шукай потрібні розділи через `rg`; не читай усю `docs/` для кожної задачі. Навчальний приклад, статичний аудит конкретного commit, гіпотеза та живий результат — різні рівні доказів. Перевіряй дату, версію, середовище й джерело твердження. Зовнішній плагін не є специфікацією Lampa чи доказом доступності API провайдера.

Перед новим викликом Lampa перевір експорт, сигнатуру, payload події та lifecycle у вихідному коді відповідної версії або доступному runtime. За відсутності підтвердження явно познач обмеження; не вигадуй методи. Суперечності між прикладами й аудитами перевіряй, а не приховуй. Зокрема, `04-storage-network.md` приписує `Reguest.clear()` скасування XHR, тоді як локальні аудити описують лише очищення callbacks; приклад input у `08-settings.md` пропускає потрібне наявному плагіну `values: ''`. Загальна порада логувати responses з `12-debug.md` не підходить для приватних даних.

## Індекс docs/ за завданнями

| Завдання | Що читати |
| --- | --- |
| Поточний стан ZebMod, встановлення, ручні перевірки | [README](README.md), відповідний provider-звіт нижче |
| Новий плагін, bootstrap, створення/закриття екрана | [01-getting-started](docs/01-getting-started.md), [02-lifecycle](docs/02-lifecycle.md) |
| Підписки, payload та очищення listeners | [03-events](docs/03-events.md) |
| Storage, запити, timeout/cancellation | [04-storage-network](docs/04-storage-network.md) і provider-звіти для перевірених уточнень |
| Шаблони, CSS, локалізації | [05-templates-lang](docs/05-templates-lang.md) |
| Select, Modal, Scroll та інші UI-компоненти | [06-ui-components](docs/06-ui-components.md) |
| Activity, Back, D-pad і відновлення фокуса | [07-navigation](docs/07-navigation.md), [13-controller](docs/13-controller.md) |
| SettingsApi, input/select і збереження параметрів | [08-settings](docs/08-settings.md), уточнення SettingsApi/Params у [README](README.md) |
| Manifest, контекстне меню, інтеграція джерела | [09-manifest-menu](docs/09-manifest-menu.md), розділ стандартної панелі у [README](README.md) |
| Player, playlist, аудіо/субтитри, cleanup | [10-player](docs/10-player.md), обмеження відповідного адаптера |
| Регресії, діагностика, пошук причини збою | [11-pitfalls](docs/11-pitfalls.md), [12-debug](docs/12-debug.md) |
| Filmix transport, формати, privacy, сценарії TCL | [Filmix_API_Diagnostics](docs/Filmix_API_Diagnostics.md), README синтетичних [Filmix fixtures](tests/fixtures/filmix/README.md) |
| Filmix HTTPS endpoints, TLS/SAN, headers, native/gateway варіанти | [Filmix_Endpoint_Verification](docs/Filmix_Endpoint_Verification.md) |
| Rezka: експериментальний контракт, challenge, transport і TCL | [Rezka_Integration](docs/Rezka_Integration.md) |
| Порівняння зі сторонніми плагінами | [Lampa_External_Plugin_References](docs/Lampa_External_Plugin_References.md); аналізуй код статично, перевіряй умови повторного використання |

## Статус провайдерів за перевірками 22.10.2026

Це історичні результати відповідних версій, не гарантія поточного стану серверів. Для нових мережевих завдань перевіряй актуальність endpoint і читай відповідний звіт.

- **Filmix:** реалізація доступна в ZebMod; інтеграцію з Lampa на TCL і відкриття FilmixScreen перевірено у 0.1.3. Пошук у 0.1.4 не працював: `stage=search`, `transport=WebView AJAX`, `HTTP=0`, `error=error`, `elapsed=369 ms`. Windows-проби: `filmixapp.cyou` та `filmixapp.vip` — TLS hostname mismatch; `api.filmix.tv` — TLS PASS, search HTTP 405; `2025.filmix.dev` — TLS PASS, API HTTP 404/HTML. Безпечний робочий HTTPS API endpoint не підтверджений; не називай Filmix працездатним провайдером. HTTP 0 не визначає TLS чи CORS. Деталі: [діагностика](docs/Filmix_API_Diagnostics.md), [endpoints](docs/Filmix_Endpoint_Verification.md).
- **Rezka / ZebMod v0.1.5 experimental:** вибір Rezka/Filmix, незалежний адаптер Rezka, FilmixScreen збережено. За звітом Codex — **212/212 LOCAL PASS**, syntax та ES5 PASS. Windows preflight: DNS/TLS PASS, головна HTTP 200 містила challenge/перевірку на бота. Реальні `search`, `detail`, `episodes`, `stream`, `playback` і **TCL v0.1.5 — NOT VERIFIED**. HTTP 200 не доводить працездатність Rezka; обходу захисту не додавати. Деталі: [Rezka_Integration](docs/Rezka_Integration.md).

## Якість і сумісність

- Плагін зберігай у standalone ES5 без нових залежностей/build system, якщо завдання не змінює ці вимоги. Сучасний синтаксис у навчальних прикладах не переноситься автоматично; Node-тести можуть використовувати сучасний JS. Зберігай локалізації uk/ru/en.
- Android — основна платформа; зберігай сумісність з Android TV, D-pad/OK/Back і відновлення фокуса.
- Реєстрації після готовності Lampa мають бути однократними. Розділяй `start/stop` та `destroy`; прибирай власні handlers/таймери, скасовуй власні запити й відкидай пізні callbacks. Не очищуй чужий активний controller.
- Зберігай наявні Storage keys, component IDs і bootstrap-прапорець; нові ідентифікатори роби унікальними. Для ZebMod зберігай FilmixScreen, одну кнопку джерела, повну картку `movie`, незалежність адаптерів та чинні settings. Не переписуй глобальні Player/Controller/методи Lampa.
- Поважай accessor `Manifest.plugins`, фактичне ім'я `onContextLauch` і подію `full/complite` у перевіреній реалізації. Не виправляй їх за припущенням. Для текстових token/device ID зберігай точні значення, включно з початковими нулями; перевір контракт Storage/Params.
- Відображай зовнішній текст через `.text()`/textContent; не виконуй отриманий JS і не вставляй remote HTML у UI. Передавай Player лише валідні реально отримані потоки/якості та серіалізований playlist без циклів; вибір результату залишай користувачеві.
- Не вимикай TLS, не додавай автоматичний HTTP downgrade, недовірені проксі або дзеркала. Зупиняй мережевий сценарій на CAPTCHA/challenge/авторизації без обходу. Для діагностики використовуй синтетичні дані; не виводь token, device ID, cookies, приватні URL/headers, raw responses чи exceptions.

## Тестування та звіт

Для змін JS виконай з кореня:

```powershell
node --check lampa-online.js
node --test tests/lampa-online.test.cjs
git diff --check
```

Suite включає ES5-перевірку через вбудований Acorn Node (`--expose-internals`); перевірене середовище — Node 24.16.0. При її збої перевір сумісність Node перед додаванням залежностей. Зберігай попередні перевірки, додавай змістовні regression-тести зміненої поведінки: помилки/timeout, retry, Back/focus, cleanup, повторний bootstrap й privacy. Fixtures лишаються синтетичними. Для правок лише інструкцій/Markdown перевір посилання, frontmatter і diff; запуск plugin suite не обов'язковий.

HTTP 200 не доводить правильну schema; status 0 не встановлює CORS/DNS/TLS. Node-запит не перевіряє CORS WebView. У звіті українською вкажи змінені файли, поведінку, фактичні команди/результати, ризики й невідомі дані; окремо познач **LOCAL PASS**, **NETWORK VERIFIED**, **TCL VERIFIED** або **NOT VERIFIED** з межами перевірки. Не видавай mocks, старі звіти чи перевірку іншого пристрою за поточний live PASS.

## Git і публікація

Перевіряй початковий та фінальний `git status`/diff; не скидай і не відновлюй чужі зміни. Версію змінюй лише в межах явно замовленої роботи; локальне виправлення не означає публікацію.

### Два канали публікації

- Основний вихідний код — `Zwanns/lampa-online`; публікація JS через GitHub Pages — `Zwanns/zwanns.github.io`. Це окремі репозиторії й окремі операції публікації.
- **STABLE:** `https://zwanns.github.io/zeb.js` — тільки версія, яку користувач вирішив опублікувати після необхідних перевірок.
- **EXPERIMENTAL:** `https://zwanns.github.io/zeb-test.js` — непідтверджені зміни для тестування на TCL. Підготовка experimental не повинна перезаписувати `zeb.js`; LOCAL PASS не доводить працездатність на Android TV.
- Обидва JS використовують спільний bootstrap-прапорець. Не рекомендуй одночасно активувати stable та experimental в одному екземплярі Lampa. Для переходу вимкни попереднє розширення та повністю перезапусти Lampa.
- Не виконуй commit, push, копіювання в Pages або деплой без прямої вказівки користувача. Не змінюй URL встановлення та bootstrap-прапорець автоматично.
