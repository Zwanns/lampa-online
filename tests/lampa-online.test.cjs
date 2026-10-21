'use strict';

// No npm dependencies, credentials, live HTTP, or changes to the plugin for testing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const pluginPath = path.join(__dirname, '..', 'lampa-online.js');
const source = fs.readFileSync(pluginPath, 'utf8');
const COMPONENT = 'lampa_online_filmix_screen';

function harness(options = {}) {
    let now = 0, nextTimer = 0, active = null, activeName = '';
    const timers = new Map(), requests = [], logs = [], notices = [], pushes = [];
    const components = {}, controllers = {}, settings = [], settingComponents = [], scrolls = [];
    const storage = options.storage || {};
    const listeners = [];
    let focus = null, collection = [], backward = 0, screen;
    const paramValues = {}, paramDefaults = {};
    // Lampa Params.select/update and input edit contract, without a live UI:
    // https://github.com/yumata/lampa-source/blob/master/src/interaction/settings/params.js
    const Params = {
        select(name, values, fallback) { paramValues[name] = values; paramDefaults[name] = fallback; },
        update(name) {
            const key = Lampa.Storage.get(name, paramDefaults[name] + '');
            return typeof paramValues[name] === 'string' ? key : paramValues[name][key] || paramValues[name][paramDefaults[name]];
        },
        edit(name, value) { Lampa.Storage.set(name, value); return this.update(name); }
    };

    class Element {
        constructor(html = '') { this.html = html; this.children = []; this.events = {}; this.parent = null; this.value = ''; }
        append(el) { el.parent = this; this.children.push(el); return this; }
        text(value) { this.value = String(value); return this; }
        on(name, callback) { this.events[name] = callback; return this; }
        off(namespace) {
            for (const name of Object.keys(this.events)) if (name.includes(namespace)) delete this.events[name];
            return this;
        }
        remove() {
            if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this);
            this.parent = null;
            this.events = {};
            return this;
        }
        trigger(type) {
            for (const [name, callback] of Object.entries(this.events)) if (name.split('.')[0] === type) callback();
            return this;
        }
    }
    const body = new Element('body');
    const $ = html => html === 'body' ? body : new Element(html);
    $.ajax = params => {
        const request = { params, aborted: false, abort() {
            this.aborted = true;
            params.error({ status: 0 }, 'abort');
        } };
        requests.push(request);
        if (options.ajaxThrows) throw new Error('synthetic transport failure');
        return request;
    };
    const flatten = el => [el, ...el.children.flatMap(flatten)];
    const text = el => flatten(el).map(x => x.value).filter(Boolean).join(' | ');
    const Lampa = {
        Listener: {
            follow(type, callback) { listeners.push({ type, callback }); },
            remove(type, callback) { const index = listeners.findIndex(x => x.type === type && x.callback === callback); if (index >= 0) listeners.splice(index, 1); }
        },
        Lang: { values: {}, add(values) { Object.assign(this.values, values); }, translate(key) { return this.values[key]?.uk || key; } },
        Storage: {
            get(key, fallback) {
                const value = Object.hasOwn(storage, key) ? storage[key] : fallback;
                return options.coerceStorage && /^\d+$/.test(value) ? parseInt(value, 10) : value;
            },
            value(key, fallback) { return String(Object.hasOwn(storage, key) ? storage[key] : fallback || ''); },
            set(key, value) { storage[key] = value; }
        },
        Template: { add() {}, get() { return new Element('style'); } },
        Component: { get(name) { return components[name]; }, add(name, value) { assert.equal(components[name], undefined); components[name] = value; } },
        Manifest: {},
        SettingsApi: {
            addComponent(value) { settingComponents.push(value); },
            addParam(value) {
                settings.push(value);
                if (value.param.type === 'input' || value.param.type === 'select') {
                    Params.select(value.param.name, value.param.values, value.param.default);
                }
            }
        },
        Noty: { show(value) { notices.push(value); } },
        Activity: {
            push(value) { pushes.push(value); },
            backward() { backward++; screen?.destroy(); }
        },
        Scroll: function () {
            this.root = new Element('scroll');
            this.append = el => this.root.append(el);
            this.render = () => this.root;
            // Like current Lampa: clearing native innerHTML does not clean jQuery events.
            this.clear = () => { for (const el of this.root.children) el.parent = null; this.root.children = []; };
            this.reset = () => {};
            this.update = el => { assert.ok(flatten(this.root).includes(el), 'scroll target must be attached'); };
            this.destroy = () => { this.destroyed = true; this.root.remove(); };
            scrolls.push(this);
        },
        Controller: {
            add(name, value) { controllers[name] = value; },
            toggle(name) {
                active?.gone?.(name);
                active = controllers[name] || {};
                activeName = name;
                active.toggle?.();
            },
            enabled() { return { name: activeName, controller: active }; },
            collectionSet(root) { collection = flatten(root).filter(el => /\bselector\b/.test(el.html)); },
            collectionFocus(target, root) {
                target = target || flatten(root).find(el => /\bselector\b/.test(el.html));
                assert.ok(collection.includes(target), 'focus must belong to the current collection');
                focus = target;
                target.trigger('hover:focus');
            },
            clear() { collection = []; focus = null; }
        },
        Player: {
            items: [], playlists: [],
            play(item) {
                if (this.throwOnPlay) throw new Error('synthetic failure with private URL');
                // Android bridge uses JSON.stringify(data) during Player.play().
                this.serialized = JSON.stringify(item);
                this.items.push(item);
                Lampa.Controller.toggle('player');
            },
            playlist(items) { this.playlists.push(items); }
        }
    };
    // The real Manifest.plugins is an accessor: assignment APPENDS a manifest.
    const unrelatedPlugin = { name: 'Other plugin', type: 'video' };
    const manifests = [unrelatedPlugin];
    Object.defineProperty(Lampa.Manifest, 'plugins', {
        get() { return manifests; },
        set(value) { if (value && typeof value.type === 'string') manifests.push(value); }
    });
    const moves = [];
    const Navigator = { move(direction) { moves.push(direction); }, canmove() { return false; } };
    const context = vm.createContext({
        Lampa: options.noLampa ? undefined : Lampa, $, Navigator,
        appready: options.ready !== false,
        console: { log(...args) { logs.push(args); }, warn(...args) { logs.push(args); }, error(...args) { logs.push(args); } },
        setTimeout(callback, ms) { const id = ++nextTimer; timers.set(id, { at: now + ms, callback }); return id; },
        clearTimeout(id) { timers.delete(id); }
    });
    context.window = context;
    const env = {
        Lampa, context, requests, logs, notices, storage, settings, Params, settingComponents, components, scrolls, listeners, manifests, unrelatedPlugin, moves, pushes, timers,
        get focus() { return focus; }, get collection() { return collection; }, get backward() { return backward; },
        get rows() { return flatten(scrolls.at(-1).root).filter(el => /\bselector\b/.test(el.html)); },
        get text() { return text(scrolls.at(-1).root); },
        label(el) { return text(el); },
        load() { vm.runInContext(source, context, { filename: 'lampa-online.js' }); },
        ready() { context.appready = true; for (const entry of [...listeners]) entry.callback({ type: 'ready' }); },
        advance(ms) {
            now += ms;
            for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) timer.callback();
        },
        open(movie = { title: 'Тест & кіно', release_date: '2020-01-01' }) {
            screen = new components[COMPONENT]({ movie });
            screen.activity = { loader(value) { env.loading = value; } };
            screen.create(); screen.start();
            return screen;
        },
        response(data, request = requests.at(-1), status = 200) {
            request.params.success(typeof data === 'string' ? data : JSON.stringify(data), 'success', { status });
        },
        error(status, kind = 'error', request = requests.at(-1)) { request.params.error({ status, responseText: 'PRIVATE_RESPONSE', message: 'PRIVATE_MESSAGE' }, kind); },
        enter(index) { const el = env.rows[index]; assert.ok(el, 'row exists: ' + index); Lampa.Controller.collectionFocus(el, scrolls.at(-1).root); el.trigger('hover:enter'); },
        back() { active.back(); },
        returnFromPlayer() { Lampa.Controller.toggle('content'); }
    };
    env.load();
    return env;
}

function postScreen(env, record) {
    const screen = env.open();
    if (env.storage.lampa_online_token) env.response({ user_data: { user_id: 1, is_pro: false, is_pro_plus: false } });
    env.response([{ id: 12, title: 'Обраний фільм', year: 2020 }]);
    env.enter(1);
    env.response({ player_links: { movie: [record] } });
    return screen;
}
const stream = { translation: 'Українська', link: 'https://media.example/movie_[2160,1080,720,480,360].mp4' };

test('standalone plugin parses as ES5', () => {
    const result = spawnSync(process.execPath, ['--expose-internals', '-e',
        "require('internal/deps/acorn/acorn/dist/acorn').parse(require('fs').readFileSync(process.argv[1],'utf8'),{ecmaVersion:5})", pluginPath], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
});

test('ready listener and all registrations are unique across reloads', () => {
    const env = harness({ ready: false });
    env.load(); env.load();
    assert.equal(env.listeners.length, 1);
    assert.equal(Object.keys(env.components).length, 0);
    env.ready(); env.ready(); env.load();
    assert.equal(env.listeners.length, 0);
    assert.equal(Object.keys(env.components).length, 1);
    assert.equal(env.manifests.length, 2);
    assert.equal(env.manifests[0], env.unrelatedPlugin);
    assert.equal(env.manifests[1].version, '0.1.2');
    assert.equal(env.settingComponents.length, 1);
    assert.equal(env.settings.length, 4);
});

test('script loaded before Lampa waits for Lampa and app ready', () => {
    const env = harness({ noLampa: true, ready: false });
    env.load();
    assert.equal(env.timers.size, 1);
    env.context.Lampa = env.Lampa;
    env.advance(200);
    assert.equal(env.listeners.length, 1);
    assert.equal(Object.keys(env.components).length, 0);
    env.ready();
    assert.ok(env.components[COMPONENT]);
    assert.equal(env.timers.size, 0);
});

test('context menu launches the registered component, including missing card fields', () => {
    const env = harness();
    const manifest = env.manifests[1];
    assert.equal(manifest.type, 'video');
    assert.match(manifest.onContextMenu().name, /Lampa Online/);
    manifest.onContextLauch({ original_name: 'Original' });
    manifest.onContextLauch();
    assert.equal(env.pushes[0].component, COMPONENT);
    assert.equal(env.pushes[0].search, 'Original');
    assert.equal(env.pushes[1].search, '');
});

test('API URL encodes query, token and persistent device ID; proxy is opt-in', () => {
    const env = harness({ storage: {
        lampa_online_api_url: 'https://api.example/api/v2', lampa_online_proxy: 'https://proxy.example',
        lampa_online_token: 'synthetic &+=?', lampa_online_device_id: 'device & test'
    } });
    const screen = env.open({ name: 'Назва & / ? кіно', first_air_date: '2023-01-01' });
    assert.ok(env.requests[0].params.url.startsWith('https://proxy.example/https://api.example/api/v2/user_profile?'));
    env.response({ user_data: { is_pro: '0', is_pro_plus: '0' } });
    const url = new URL(env.requests[1].params.url.slice('https://proxy.example/'.length));
    assert.equal(url.pathname, '/api/v2/search');
    assert.equal(url.searchParams.get('story'), 'Назва & / ? кіно');
    assert.equal(url.searchParams.get('user_dev_token'), 'synthetic &+=?');
    assert.equal(url.searchParams.get('user_dev_id'), 'device & test');
    for (const [key, value] of Object.entries({ app_lang: 'ru_RU', user_dev_apk: '2.2.13', user_dev_name: 'Lampa', user_dev_os: 'Android', user_dev_vendor: 'Lampa' })) {
        assert.equal(url.searchParams.get(key), value);
    }
    assert.equal(env.requests[1].params.type, 'GET');
    assert.equal(env.requests[1].params.dataType, 'text');
    assert.equal(env.requests[1].params.crossDomain, true);
    assert.equal(env.requests[1].params.global, false);
    assert.equal(env.requests[1].params.timeout, 15000);
    screen.destroy();
    const guest = harness(); guest.open();
    assert.match(guest.storage.lampa_online_device_id, /^[a-f0-9]{16}$/);
    assert.ok(guest.requests[0].params.url.startsWith('https://filmixapp.cyou/api/v2/search?'));
});

test('device ID and settings survive a fresh plugin runtime', () => {
    const storage = { lampa_online_api_url: 'https://custom.example/api/v2/', lampa_online_token: 'synthetic-token' };
    const first = harness({ storage }); const id = storage.lampa_online_device_id;
    const second = harness({ storage });
    second.open();
    assert.equal(storage.lampa_online_device_id, id);
    assert.equal(first.settings[0].param.name, 'lampa_online_api_url');
    assert.ok(second.requests[0].params.url.startsWith(storage.lampa_online_api_url));
});

test('all four text inputs register values and open through Params.update without TypeError', () => {
    const env = harness();
    assert.deepEqual(env.settings.map(x => x.param.name), [
        'lampa_online_api_url', 'lampa_online_token', 'lampa_online_proxy', 'lampa_online_device_id'
    ]);
    for (const { param } of env.settings) {
        assert.equal(param.type, 'input');
        assert.equal(param.values, '');
        assert.doesNotThrow(() => env.Params.update(param.name));
        assert.equal(env.Params.update(param.name), param.default);
    }
    // This is the original Lampa failure if input values are not registered.
    env.Params.select('missing_values', undefined, 'https://filmixapp.cyou/api/v2/');
    assert.throws(() => env.Params.update('missing_values'), TypeError);
});

test('settings edits survive reopening and a persisted-storage restart without losing existing values', () => {
    const storage = {
        lampa_online_api_url: 'https://existing.example/api/v2/', lampa_online_token: 'existing-token',
        lampa_online_proxy: 'https://existing-proxy.example/', lampa_online_device_id: '00001234567890123456',
        unrelated_setting: 'preserved'
    };
    const original = { ...storage }, first = harness({ storage });
    assert.deepEqual(storage, original, 'registration does not overwrite existing settings');
    for (const { param } of first.settings) assert.equal(first.Params.update(param.name), original[param.name]);
    const edited = {
        lampa_online_api_url: 'https://edited.example/api/v2/', lampa_online_token: '00001234&+=?',
        lampa_online_proxy: 'https://edited-proxy.example/', lampa_online_device_id: '00009999888877776666'
    };
    for (const [name, value] of Object.entries(edited)) {
        assert.equal(first.Params.edit(name, value), value);
        assert.equal(first.Params.update(name), value, 'reopen uses saved value');
    }
    const persisted = JSON.parse(JSON.stringify(storage));
    const restarted = harness({ storage: persisted });
    for (const [name, value] of Object.entries(edited)) assert.equal(restarted.Params.update(name), value);
    assert.equal(persisted.unrelated_setting, 'preserved');
    restarted.open();
    const profile = new URL(restarted.requests[0].params.url.slice(edited.lampa_online_proxy.length));
    assert.equal(profile.origin, 'https://edited.example');
    assert.equal(profile.searchParams.get('user_dev_token'), edited.lampa_online_token);
    assert.equal(profile.searchParams.get('user_dev_id'), edited.lampa_online_device_id);
    const cleared = harness({ storage: persisted });
    cleared.Params.edit('lampa_online_token', ''); cleared.Params.edit('lampa_online_proxy', '');
    const guest = harness({ storage: JSON.parse(JSON.stringify(persisted)) }); guest.open();
    assert.equal(new URL(guest.requests[0].params.url).pathname, '/api/v2/search');
    assert.equal(guest.Params.update('lampa_online_token'), '');
    assert.equal(guest.Params.update('lampa_online_proxy'), '');
});

test('numeric token and device ID preserve leading zeros despite Storage.get coercion', () => {
    const env = harness({ coerceStorage: true, storage: {
        lampa_online_device_id: '00001234567890123456', lampa_online_token: '0000123456'
    } });
    env.open();
    const url = new URL(env.requests[0].params.url);
    assert.equal(url.searchParams.get('user_dev_id'), '00001234567890123456');
    assert.equal(url.searchParams.get('user_dev_token'), '0000123456');
});

test('search displays separate results and metadata without autoplay', () => {
    const env = harness(); env.open({ original_title: 'Original', year: 2021 });
    env.response([null, {}, { id: 1, title: 'Фільм', original_title: 'Original', release_date: '2021-01-01' }, { id: 2, name: 'Серіал', first_air_date: '2022-02-02' }]);
    assert.equal(env.rows.length, 3);
    assert.match(env.label(env.rows[1]), /2021.*Original.*ID 1/);
    assert.match(env.label(env.rows[2]), /2022/);
    assert.equal(env.Lampa.Player.items.length, 0);
    assert.equal(env.loading, false);
    assert.ok(env.collection.includes(env.focus));
});

test('empty search retries once using original title, then offers manual retry', () => {
    const env = harness(); env.open({ title: 'Локальна', original_title: 'Original' });
    env.response([]);
    assert.equal(new URL(env.requests[1].params.url).searchParams.get('story'), 'Original');
    env.response([null, { id: 'invalid' }]);
    assert.match(env.text, /Нічого не знайдено/);
    assert.equal(env.loading, false);
    env.enter(1);
    assert.equal(env.requests.length, 3);
});

test('missing title stops the loader without sending HTTP', () => {
    const env = harness(); env.open({});
    assert.equal(env.requests.length, 0);
    assert.equal(env.loading, false);
    assert.match(env.text, /відсутня назва/);
});

test('guest template media uses only declared qualities at or below 480p', () => {
    const env = harness(); postScreen(env, stream); env.enter(1);
    const item = env.Lampa.Player.items[0];
    assert.match(item.url, /_480\.mp4$/);
    assert.deepEqual(Object.keys(item.quality), ['480p', '360p']);
    assert.equal(env.Lampa.Player.playlists[0][0], item);
    assert.ok(!item.playlist, 'no cyclic playlist object');
});

for (const [name, profile, max] of [
    ['free string flags', { user_data: { is_pro: '0', is_pro_plus: '0' } }, 720],
    ['pro string flags', { user_data: { is_pro: '1', is_pro_plus: '0' } }, 1080],
    ['pro plus', { user_data: { is_pro_plus: true } }, 2160],
    ['root profile', { user_id: 1, is_pro: true }, 1080],
    ['expired timestamp', { user_data: { is_pro: 1_000_000_000 } }, 720],
    ['invalid profile', { error: 'unauthorized' }, 480]
]) test('profile cap: ' + name, () => {
    const env = harness({ storage: { lampa_online_token: 'synthetic-token', video_quality_default: '1080' } });
    env.open();
    assert.equal(env.requests.length, 1, 'search waits for profile');
    assert.ok(env.requests[0].params.url.includes('/user_profile?'));
    env.response(profile);
    env.response([{ id: 1 }]); env.enter(1);
    env.response({ player_links: { movie: [stream] } }); env.enter(1);
    const item = env.Lampa.Player.items[0];
    assert.equal(Math.max(...Object.keys(item.quality).map(parseFloat)), max);
    assert.match(item.url, new RegExp('_' + Math.min(max, 1080) + '\\.mp4$'));
});

test('profile timeout falls back to guest and continues search without a race', () => {
    const env = harness({ storage: { lampa_online_token: 'synthetic-token' } }); env.open();
    const profile = env.requests[0]; env.advance(8000);
    assert.equal(profile.aborted, true);
    assert.equal(env.requests.length, 2);
    env.response({ user_data: { is_pro_plus: true } }, profile);
    assert.equal(env.requests.length, 2, 'late profile ignored');
    assert.match(env.notices[0], /гостьове/);
});

for (const [name, record, playable, suffix] of [
    ['plain MP4', { link: 'https://media.example/plain.mp4' }, true, 'plain.mp4'],
    ['HLS with query', { link: 'https://media.example/live.m3u8?key=synthetic' }, true, 'live.m3u8?key=synthetic'],
    ['percent template', { link: 'https://media.example/episode_%s.mp4', qualities: [1080, 480] }, true, 'episode_480.mp4'],
    ['unadvertised template', { link: 'https://media.example/episode_%s.mp4' }, false],
    ['paid-only template', { link: 'https://media.example/movie_[2160,1080].mp4' }, false],
    ['explicit paid quality', { link: 'https://media.example/plain.mp4', quality: 1080 }, false],
    ['plain paid suffix', { link: 'https://media.example/movie_1080.mp4' }, false],
    ['invalid list values', { link: 'https://media.example/episode_%s.mp4', qualities: ['480oops', 1080] }, false],
    ['HTML embed', { link: 'https://media.example/player.html' }, false],
    ['unsupported scheme', { link: 'javascript:alert(1)' }, false],
    ['missing link', {}, false]
]) test('stream handling: ' + name, () => {
    const env = harness(); postScreen(env, record); env.enter(1);
    assert.equal(env.Lampa.Player.items.length, playable ? 1 : 0);
    if (playable) assert.ok(env.Lampa.Player.items[0].url.endsWith(suffix));
    else assert.match(env.notices[0], /Немає доступного/);
});

test('series sorts seasons and numeric episode keys, skips malformed entries, sends the complete playlist', () => {
    const env = harness(); env.open({ name: 'Серіал' });
    env.response([{ id: 99, name: 'Знайдений серіал' }]); env.enter(1);
    const episode = n => ({ link: `https://media.example/s1e${n}_%s.mp4`, qualities: [720, 480] });
    env.response({ player_links: { playlist: {
        10: { 'Голос': [episode(1)] }, 2: { 'Порожньо': null, 'Голос': {} },
        1: { 'Українська': { 10: episode(10), 2: episode(2), 1: episode(1), 3: {}, broken: { link: 'https://media.example/plain.mp4' } } }, nonsense: {}
    } } });
    assert.match(env.label(env.rows[1]), /Сезон 1/);
    assert.match(env.label(env.rows[2]), /Сезон 10/);
    env.enter(1);
    assert.deepEqual(env.rows.slice(1).map(el => env.label(el).split(' | ')[0]), ['Серія 1', 'Серія 2', 'Серія 10']);
    env.enter(2);
    assert.match(env.Lampa.Player.items[0].title, /S1E2/);
    assert.match(env.Lampa.Player.items[0].url, /s1e2_480/);
    assert.equal(env.Lampa.Player.playlists[0].length, 3);
    assert.equal(env.Lampa.Player.items[0].playlist, env.Lampa.Player.playlists[0]);
    assert.ok(!env.Lampa.Player.playlists[0].includes(env.Lampa.Player.items[0]));
    assert.equal(JSON.parse(env.Lampa.Player.serialized).playlist.length, 3, 'Android launch already includes the playlist');
    const savedFocus = env.focus;
    env.returnFromPlayer();
    assert.equal(env.focus, savedFocus);
    const count = env.requests.length;
    env.back(); assert.match(env.text, /Сезон 10/);
    env.back(); assert.match(env.text, /Результати пошуку/);
    assert.equal(env.requests.length, count, 'Back does not rerun search');
    env.back(); assert.equal(env.backward, 1);
    assert.equal(env.timers.size, 0);
});

test('series accepts episode arrays and sentinel season -1; repeated opening stays stable', () => {
    const env = harness(); env.open(); env.response([{ id: 1 }]); env.enter(1);
    env.response({ player_links: { playlist: { '-1': { Voice: [null, { link: 'https://media.example/episode.m3u8' }] } } } });
    env.enter(1); assert.match(env.text, /Серія 2/);
    env.back(); env.enter(1); assert.equal(env.rows.length, 2);
    env.enter(1); assert.match(env.Lampa.Player.items[0].title, /S1E2/);
});

test('named episode keys use the provider sNeN path and sort by actual number', () => {
    const env = harness(); env.open(); env.response([{ id: 1 }]); env.enter(1);
    env.response({ player_links: { playlist: { 1: { Voice: {
        'Фінал': { link: 'https://media.example/s1e10_480.mp4' },
        'Пілот': { link: 'https://media.example/s1e1_480.mp4' }
    } } } } });
    env.enter(1);
    assert.match(env.label(env.rows[1]), /Серія 1 \|/);
    assert.match(env.label(env.rows[2]), /Серія 10/);
    env.enter(2);
    assert.equal(env.Lampa.Player.items[0].episode, 10);
    assert.equal(env.Lampa.Player.items[0].season, '1');
});

test('stop/start restores loaded content and focus without another search', () => {
    const env = harness(); const screen = env.open(); env.response([{ id: 1 }, { id: 2 }]);
    env.Lampa.Controller.collectionFocus(env.rows[2], env.scrolls[0].root);
    const savedFocus = env.focus;
    screen.stop(); screen.start();
    assert.equal(env.focus, savedFocus);
    assert.equal(env.requests.length, 1);
});

test('invalid stream authority is rejected', () => {
    const env = harness(); postScreen(env, { link: 'https:///broken.mp4' }); env.enter(1);
    assert.equal(env.Lampa.Player.items.length, 0);
});

for (const [status, kind, expected] of [
    [401, 'error', /401\/403/], [403, 'error', /401\/403/], [404, 'error', /404/], [429, 'error', /429/],
    [500, 'error', /5xx/], [502, 'error', /5xx/], [503, 'error', /5xx/], [0, 'error', /підключення/], [0, 'timeout', /вчасно/]
]) test(`API failure ${status}/${kind} stops loading and allows retry without sensitive logs`, () => {
    const env = harness(); env.open(); env.error(status, kind);
    assert.equal(env.loading, false); assert.match(env.text, expected);
    assert.ok(!JSON.stringify(env.logs).includes('PRIVATE'));
    assert.ok(env.logs.some(args => args[0] === `LampaOnline | network | search | complete http=${status} error=${kind} json=unknown filmix=unknown`));
    env.enter(1); assert.equal(env.requests.length, 2);
});

for (const response of ['<html>bad gateway</html>', '{broken', 'null', '{}']) test('malformed JSON or search shape: ' + response, () => {
    const env = harness(); env.open(); env.response(response);
    assert.equal(env.loading, false);
    assert.match(env.text, /JSON|формат/);
    env.enter(1); assert.equal(env.requests.length, 2);
});

test('watchdog aborts stalled search and ignores its late response', () => {
    const env = harness(); env.open(); const request = env.requests[0];
    env.advance(15000);
    assert.equal(request.aborted, true); assert.equal(env.loading, false);
    env.response([{ id: 1, title: 'LATE' }], request);
    assert.ok(!env.text.includes('LATE'));
    assert.match(env.text, /вчасно/);
});

test('synchronous transport failure is recoverable', () => {
    const env = harness({ ajaxThrows: true }); env.open();
    assert.equal(env.loading, false); assert.equal(env.timers.size, 0);
    assert.match(env.text, /підключення/);
});

for (const url of ['http://api.example/api/v2', 'https://api.example/api/v2?token=private', 'file:///api', 'https://user:password@api.example/api/v2']) test('invalid or insecure API setting is rejected: ' + url, () => {
    const env = harness({ storage: { lampa_online_api_url: url } }); env.open();
    assert.equal(env.requests.length, 0); assert.equal(env.loading, false);
    assert.match(env.text, /адрес|HTTPS/);
});

test('post error and absent player_links allow retry', () => {
    const env = harness(); env.open(); env.response([{ id: 1 }]); env.enter(1);
    env.error(503); assert.equal(env.loading, false);
    env.enter(1); env.response({}); assert.match(env.text, /Немає доступного/);
    env.enter(1); env.response({ player_links: {} });
    assert.equal(env.rows.length, 1); assert.equal(env.loading, false);
});

test('Back aborts post and restores selected result; late post cannot change screen', () => {
    const env = harness(); env.open(); env.response([{ id: 1 }, { id: 2 }]); env.enter(2);
    const post = env.requests.at(-1); env.back();
    assert.equal(post.aborted, true); assert.match(env.label(env.focus), /ID 2/);
    env.response({ player_links: { movie: [stream] } }, post);
    assert.match(env.text, /Результати пошуку/);
});

test('async search completion does not steal focus from the Lampa menu', () => {
    const env = harness(); env.open(); env.Lampa.Controller.toggle('menu');
    const savedFocus = env.focus;
    env.response([{ id: 1 }]);
    assert.equal(env.Lampa.Controller.enabled().name, 'menu');
    assert.equal(env.focus, savedFocus);
    env.Lampa.Controller.toggle('content'); assert.ok(env.collection.includes(env.focus));
});

test('remote arrows delegate to Navigator and Left opens the menu', () => {
    const env = harness(); env.open(); const controller = env.Lampa.Controller.enabled().controller;
    controller.up(); controller.down(); controller.right(); controller.left();
    assert.deepEqual(env.moves, ['up', 'down', 'right']);
    assert.equal(env.Lampa.Controller.enabled().name, 'menu');
});

test('standard player receives error callback, handles synchronous and asynchronous failures', () => {
    const env = harness(); postScreen(env, { link: 'https://media.example/plain.mp4' });
    env.Lampa.Player.throwOnPlay = true; env.enter(1);
    assert.match(env.notices.at(-1), /Не вдалося/);
    assert.equal(env.Lampa.Controller.enabled().name, 'content');
    env.Lampa.Player.throwOnPlay = false; env.enter(1);
    env.Lampa.Player.items[0].error(); assert.match(env.notices.at(-1), /Не вдалося/);
    assert.ok(!JSON.stringify(env.logs).includes('private URL'));
});

test('destroy aborts requests, clears timers and row handlers, releases controller closures, and is idempotent', () => {
    const env = harness(); const screen = env.open(); const request = env.requests[0];
    const controller = env.Lampa.Controller.enabled().controller;
    const row = env.rows[0];
    screen.destroy(); screen.destroy(); screen.start();
    assert.equal(request.aborted, true); assert.equal(env.timers.size, 0);
    assert.equal(Object.keys(row.events).length, 0);
    assert.equal(Object.keys(controller).length, 1);
    assert.equal(env.collection.length, 0);
    assert.equal(env.scrolls[0].destroyed, true);
    const afterDestroy = JSON.stringify(env.logs);
    env.response([{ id: 1 }], request); env.error(500, 'error', request);
    assert.equal(JSON.stringify(env.logs), afterDestroy);
    const reopened = env.open(); env.response([{ id: 2 }]); assert.match(env.text, /ID 2/); reopened.destroy();
});

test('destroying an inactive screen preserves another active controller', () => {
    const env = harness(); const screen = env.open();
    const other = { back() {} }; env.Lampa.Controller.add('content', other); env.Lampa.Controller.toggle('content');
    screen.destroy(); assert.equal(env.Lampa.Controller.enabled().controller, other);
    assert.equal(typeof other.back, 'function');
});

test('destroy during profile cancels it and never starts search', () => {
    const env = harness({ storage: { lampa_online_token: 'synthetic-token' } }); const screen = env.open();
    const request = env.requests[0]; screen.destroy();
    assert.equal(request.aborted, true); assert.equal(env.timers.size, 0);
    env.response({ user_data: { is_pro_plus: true } }, request);
    assert.equal(env.requests.length, 1);
    assert.ok(!JSON.stringify(env.logs).includes('synthetic-token'));
});

function networkLines(env, stage) {
    return env.logs.map(args => args[0]).filter(line => line.startsWith('LampaOnline | network | ' + stage + ' | '));
}

test('successful search logs start and completion with the actual HTTP status and Filmix shape', () => {
    const env = harness(); env.open();
    assert.deepEqual(networkLines(env, 'search'), [
        'LampaOnline | network | search | start http=0 error=none json=unknown filmix=unknown'
    ]);
    env.response([{ id: 12, title: 'Mock film' }], undefined, 201);
    assert.equal(networkLines(env, 'search')[1], 'LampaOnline | network | search | complete http=201 error=none json=true filmix=true');
    assert.equal(env.loading, false); assert.equal(env.rows.length, 2);
});

for (const [body, json, filmix, error] of [
    ['{broken', false, false, 'parsererror'], ['<html>failure</html>', false, false, 'parsererror'],
    ['{}', true, false, 'none'], ['null', true, false, 'none'], ['123', true, false, 'none'],
    ['[1,2]', true, false, 'none'], ['[]', true, true, 'none']
]) test('diagnostics distinguish JSON parsing from Filmix shape: ' + body, () => {
    const env = harness(); env.open(); env.response(body);
    assert.equal(networkLines(env, 'search')[1], `LampaOnline | network | search | complete http=200 error=${error} json=${json} filmix=${filmix}`);
    assert.equal(env.loading, false);
});

for (const [status, kind] of [[401, 'error'], [403, 'error'], [404, 'error'], [429, 'error'], [500, 'error'], [0, 'timeout'], [0, 'error'], [200, 'parsererror']]) {
    test(`profile diagnostics ${status}/${kind} continue as guest and show a clear error`, () => {
        const env = harness({ storage: { lampa_online_token: 'PRIVATE_TOKEN' } }); env.open();
        assert.equal(networkLines(env, 'user_profile').length, 1);
        env.error(status, kind);
        const json = kind === 'parsererror' ? 'false' : 'unknown';
        assert.equal(networkLines(env, 'user_profile')[1], `LampaOnline | network | user_profile | complete http=${status} error=${kind} json=${json} filmix=${json}`);
        assert.match(env.notices.at(-1), /профіль/i);
        assert.equal(env.requests.length, 2);
        assert.equal(new URL(env.requests[1].params.url).pathname, '/api/v2/search');
        assert.ok(!JSON.stringify(env.logs).includes('PRIVATE'));
    });
}

for (const profile of [{ unexpected: 'PRIVATE' }, null, []]) test('valid JSON with invalid profile shape safely falls back: ' + JSON.stringify(profile), () => {
    const env = harness({ storage: { lampa_online_token: 'PRIVATE_TOKEN' } }); env.open(); env.response(profile);
    assert.equal(networkLines(env, 'user_profile')[1], 'LampaOnline | network | user_profile | complete http=200 error=none json=true filmix=false');
    assert.match(env.notices.at(-1), /формат/);
    assert.equal(env.requests.length, 2);
});

for (const useProfile of [false, true]) test('cancellation logs completion once and ignores late callbacks: profile=' + useProfile, () => {
    const env = harness({ storage: useProfile ? { lampa_online_token: 'PRIVATE_TOKEN' } : {} });
    const screen = env.open(), request = env.requests[0], stage = useProfile ? 'user_profile' : 'search';
    screen.destroy();
    assert.deepEqual(networkLines(env, stage), [
        `LampaOnline | network | ${stage} | start http=0 error=none json=unknown filmix=unknown`,
        `LampaOnline | network | ${stage} | complete http=0 error=abort json=unknown filmix=unknown`
    ]);
    const saved = JSON.stringify(env.logs);
    env.response([{ id: 1 }], request); env.error(500, 'error', request); env.advance(20000);
    assert.equal(JSON.stringify(env.logs), saved);
    assert.equal(env.requests.length, 1); assert.equal(env.timers.size, 0);
});

test('watchdog reports timeout once despite abort callbacks and a late success', () => {
    const env = harness(); env.open(); const request = env.requests[0];
    env.advance(15000); env.response([], request);
    assert.equal(networkLines(env, 'search').length, 2);
    assert.equal(networkLines(env, 'search')[1], 'LampaOnline | network | search | complete http=0 error=timeout json=unknown filmix=unknown');
    assert.equal(env.requests.length, 1);
});

test('diagnostics never expose tokens, device IDs, URLs, query text, profile data or server error text', () => {
    const env = harness({ storage: {
        lampa_online_api_url: 'https://PRIVATE_HOST.example/api/v2/', lampa_online_proxy: 'https://PRIVATE_PROXY.example/',
        lampa_online_token: 'PRIVATE_TOKEN &+=?', lampa_online_device_id: 'PRIVATE_DEVICE'
    } });
    env.open({ title: 'PRIVATE_QUERY' });
    env.response({ user_data: { user_id: 1, login: 'PRIVATE_LOGIN', is_pro: true } });
    assert.equal(networkLines(env, 'user_profile')[1], 'LampaOnline | network | user_profile | complete http=200 error=none json=true filmix=true');
    env.response([{ id: 1, title: 'PRIVATE_TITLE' }]); env.enter(1);
    env.error(0, 'PRIVATE_ERROR_KIND');
    assert.equal(networkLines(env, 'post')[1], 'LampaOnline | network | post | complete http=0 error=error json=unknown filmix=unknown');
    env.enter(1); env.response({ player_links: { movie: [{ link: 'https://media.example/PRIVATE_STREAM.mp4' }] } });
    assert.equal(networkLines(env, 'post').at(-1), 'LampaOnline | network | post | complete http=200 error=none json=true filmix=true');
    const logs = JSON.stringify(env.logs);
    assert.doesNotMatch(logs, /PRIVATE|https?:|user_dev_|%26|%3F/);
});
