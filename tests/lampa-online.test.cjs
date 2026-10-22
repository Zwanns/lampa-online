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
    const timers = new Map(), requests = [], logs = [], notices = [], pushes = [], storageWrites = [];
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
        find(selector) { return new Collection(flatten(this).slice(1).filter(el => matches(el, selector))); }
    }
    const matches = (el, selector) => {
        const classes = (el.html.match(/class="([^"]*)"/)?.[1] || '').split(/\s+/);
        return selector.split('.').filter(Boolean).every(name => classes.includes(name));
    };
    // Only the scoped jQuery traversal/insertion used by full-card integration.
    // Collections remain distinct from the node's children array used by Scroll.
    class Collection {
        constructor(items) { this.items = items; this.length = items.length; }
        first() { return new Collection(this.items.slice(0, 1)); }
        last() { return new Collection(this.items.slice(-1)); }
        children(selector) { return new Collection(this.items.flatMap(el => el.children).filter(el => matches(el, selector))); }
        append(el) { this.items[0].append(el); return this; }
        after(el) {
            const target = this.items[0], parent = target.parent;
            el.parent = parent;
            parent.children.splice(parent.children.indexOf(target) + 1, 0, el);
            return this;
        }
        on(name, callback) { for (const el of this.items) el.on(name, callback); return this; }
        off(namespace) { for (const el of this.items) el.off(namespace); return this; }
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
        Lang: { values: {}, add(values) { Object.assign(this.values, values); }, translate(key) { return this.values[key]?.[options.language || 'uk'] || key; } },
        Storage: {
            get(key, fallback) {
                const value = Object.hasOwn(storage, key) ? storage[key] : fallback;
                return options.coerceStorage && /^\d+$/.test(value) ? parseInt(value, 10) : value;
            },
            value(key, fallback) { return String(Object.hasOwn(storage, key) ? storage[key] : fallback || ''); },
            set(key, value) {
                if (options.storageWriteFails && key === 'plugins') throw new Error('synthetic storage failure');
                storage[key] = value;
                storageWrites.push({ key, value });
            }
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
    if (options.pluginsApi) Lampa.Plugins = options.pluginsApi;
    else if (options.installed) Lampa.Plugins = {
        get() { return options.installed.map(entry => entry); },
        save() { throw new Error('Plugins.save must not log the installed list'); },
        push() { throw new Error('rename must not reload or fetch a script'); }
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
        performance: { now() { return now; } },
        appready: options.ready !== false,
        console: { log(...args) { logs.push(args); }, warn(...args) { logs.push(args); }, error(...args) { logs.push(args); } },
        setTimeout(callback, ms) { const id = ++nextTimer; timers.set(id, { at: now + ms, callback }); return id; },
        clearTimeout(id) { timers.delete(id); }
    });
    context.window = context;
    const env = {
        Lampa, context, requests, logs, notices, storage, settings, Params, settingComponents, components, scrolls, listeners, manifests, unrelatedPlugin, moves, pushes, timers, body, storageWrites,
        element(html) { return new Element(html); },
        full(event) { for (const entry of [...listeners]) if (entry.type === 'full') entry.callback(event); },
        get focus() { return focus; }, get collection() { return collection; }, get backward() { return backward; },
        get rows() { return flatten(scrolls.at(-1).root).filter(el => /\bselector\b/.test(el.html)); },
        get text() { return text(scrolls.at(-1).root); },
        label(el) { return text(el); },
        load() { vm.runInContext(source, context, { filename: 'lampa-online.js' }); },
        ready() { context.appready = true; for (const entry of [...listeners]) if (entry.type === 'app') entry.callback({ type: 'ready' }); },
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

function fullCard(env, movie = { title: 'Фільм', original_title: 'Movie', release_date: '2024-04-02' }, options = {}) {
    const root = env.element('<div class="full"></div>');
    const container = env.element('<div class="buttons--container"></div>');
    const watch = env.element('<div class="button--play selector"></div>').text('Дивитись');
    root.append(watch);
    if (!options.noContainer) root.append(container);
    const source = (className, title) => {
        const button = env.element('<div class="full-start__button selector ' + className + '"></div>').text(title);
        button.on('hover:enter.otherSource', () => visits.push(title));
        container.append(button);
        return button;
    };
    const visits = [];
    if (!options.noTorrent) source('view--torrent', 'Торренти');
    source('shots-view-button view--online', 'Shots');
    source('view--trailer', 'Трейлер');
    source('view--online', 'Інший онлайн');
    const fixture = {
        root, container, watch, visits, source, panel: null, panelIndex: 0,
        event: { type: 'complite', object: { activity: { render: () => root } }, data: { movie }, body: root },
        get buttons() { return container.children.filter(el => /\bfull-start__button\b/.test(el.html)); },
        get online() { return container.children.filter(el => /\bview--lampa-online\b/.test(el.html)); },
        complete() { env.full(this.event); return this; },
        selectOnline() {
            watch.trigger('hover:enter');
            const index = this.buttons.indexOf(this.online[0]);
            env.Lampa.Controller.enabled().controller.down();
            while (this.panelIndex !== index) env.Lampa.Controller.enabled().controller.down();
            env.focus.trigger('hover:enter');
        },
        restore() {
            env.Lampa.Controller.add('content', {
                toggle() {
                    env.Lampa.Controller.collectionSet(watch);
                    env.Lampa.Controller.collectionFocus(watch, watch);
                }
            });
            env.Lampa.Controller.toggle('content');
        }
    };
    // Mock Lampa's native grouping contract from full/start/buttons.js: Watch
    // reads direct source children on each open, then selection triggers the
    // original button. Navigation/Back belong to Lampa, not to our source hook.
    watch.on('hover:enter.nativeWatch', () => {
        const panel = env.element('<div class="select"></div>');
        fixture.panel = panel;
        fixture.panelIndex = 0;
        for (const button of fixture.buttons) {
            panel.append(env.element('<div class="selector"></div>').on('hover:enter', () => button.trigger('hover:enter')));
        }
        const move = delta => {
            fixture.panelIndex = (fixture.panelIndex + delta + panel.children.length) % panel.children.length;
            env.Lampa.Controller.collectionFocus(panel.children[fixture.panelIndex], panel);
        };
        env.Lampa.Controller.add('select', {
            toggle() { env.Lampa.Controller.collectionSet(panel); move(0); },
            up() { move(-1); }, down() { move(1); }, back() { fixture.restore(); }
        });
        env.Lampa.Controller.toggle('select');
    });
    return fixture;
}

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
    assert.equal(env.listeners.length, 1);
    assert.equal(env.listeners[0].type, 'full');
    assert.equal(Object.keys(env.components).length, 1);
    assert.equal(env.manifests.length, 2);
    assert.equal(env.manifests[0], env.unrelatedPlugin);
    assert.equal(env.manifests[1].version, '0.1.4');
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
    assert.match(manifest.onContextMenu().name, /ZebMod/);
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

test('full listener registers once at ready and stays unique after reloads', () => {
    const env = harness({ ready: false });
    assert.equal(env.listeners.filter(x => x.type === 'full').length, 0);
    env.load(); env.ready(); env.ready(); env.load();
    assert.equal(env.listeners.filter(x => x.type === 'full').length, 1);
    assert.equal(env.listeners.filter(x => x.type === 'app').length, 0);
});

test('only full/complite with card data adds a source', () => {
    const env = harness(), card = fullCard(env);
    for (const event of [undefined, {}, { ...card.event, type: 'complete' },
        { ...card.event, type: 'start' }, { ...card.event, type: 'build' },
        { ...card.event, data: undefined }, { ...card.event, data: {} }]) {
        assert.doesNotThrow(() => env.full(event));
        assert.equal(card.online.length, 0);
    }
    card.complete();
    assert.equal(card.online.length, 1);
    assert.equal(env.requests.length, 0, 'full-card completion never starts Filmix requests');
});

test('source has the standard classes, play SVG, name and remote enter binding', () => {
    const env = harness(), card = fullCard(env).complete();
    assert.match(card.online[0].html, /class="full-start__button selector view--lampa-online"/);
    assert.match(card.online[0].html, /<svg[^>]*viewBox="0 0 24 24"/);
    assert.match(card.online[0].html, /<path[^>]*fill="currentColor"/);
    assert.match(card.online[0].html, /<span>ZebMod<\/span>/);
    card.online[0].trigger('hover:enter');
    assert.equal(env.pushes.length, 1);
    assert.equal(env.pushes[0].component, COMPONENT);
    assert.ok(env.components[env.pushes[0].component]);
});

test('source is a direct container child immediately after the last torrent', () => {
    const env = harness(), card = fullCard(env);
    const lastTorrent = card.source('view--torrent', 'Другі торренти');
    card.complete();
    assert.equal(card.online[0].parent, card.container);
    assert.equal(card.container.children.indexOf(card.online[0]), card.container.children.indexOf(lastTorrent) + 1);
});

test('missing torrent appends the source to the local standard container', () => {
    const env = harness(), card = fullCard(env, undefined, { noTorrent: true });
    const previous = [...card.container.children];
    card.complete();
    assert.deepEqual(card.container.children.slice(0, -1), previous);
    assert.equal(card.container.children.at(-1), card.online[0]);
});

test('missing local container cannot inject a source into another card or global body', () => {
    const env = harness(), other = fullCard(env), card = fullCard(env, undefined, { noContainer: true });
    env.body.append(other.root);
    const originalBody = [...env.body.children];
    card.complete();
    assert.equal(card.online.length, 0);
    assert.equal(other.online.length, 0);
    assert.deepEqual(env.body.children, originalBody);
    assert.equal(env.requests.length, 0);
});

test('event activity render determines scope even when body belongs to another card', () => {
    const env = harness(), card = fullCard(env), other = fullCard(env);
    card.event.body = other.root;
    card.complete();
    assert.equal(card.online.length, 1);
    assert.equal(other.online.length, 0);
});

test('event body is a scoped fallback when activity render is unavailable', () => {
    const env = harness(), card = fullCard(env);
    delete card.event.object;
    card.complete();
    assert.equal(card.online.length, 1);
    card.online[0].trigger('hover:enter');
    assert.equal(env.pushes[0].movie, card.event.data.movie);
});

test('missing or incompatible full-card DOM is safely ignored', () => {
    const env = harness();
    for (const body of [undefined, null, {}, 'not a jQuery root']) {
        assert.doesNotThrow(() => env.full({ type: 'complite', data: { movie: {} }, body }));
    }
    assert.equal(env.pushes.length, 0);
});

test('repeated completion reuses one source and one handler without removing foreign handlers', () => {
    const env = harness(), card = fullCard(env).complete(), button = card.online[0];
    let foreignEnters = 0;
    button.on('hover:enter.foreign', () => foreignEnters++);
    for (let i = 0; i < 20; i++) card.complete();
    assert.deepEqual(card.online, [button]);
    assert.equal(Object.keys(button.events).filter(name => name.endsWith('.lampaOnlineSource')).length, 1);
    button.trigger('hover:enter');
    assert.equal(env.pushes.length, 1);
    assert.equal(foreignEnters, 1);
});

test('reloading JS and completing the existing card cannot duplicate sources or launches', () => {
    const env = harness(), card = fullCard(env).complete();
    for (let i = 0; i < 10; i++) { env.load(); card.complete(); }
    assert.equal(card.online.length, 1);
    assert.equal(env.listeners.filter(x => x.type === 'full').length, 1);
    card.online[0].trigger('hover:enter');
    assert.equal(env.pushes.length, 1);
    assert.equal(env.manifests.length, 2);
    assert.equal(env.settings.length, 4);
});

test('source and legacy context launch share the same complete film payload', () => {
    const env = harness();
    const movie = { id: 17, title: 'Назва', original_title: 'Original', release_date: '2021-07-06', year: '2021', extra: { preserved: true } };
    const card = fullCard(env, movie).complete();
    card.online[0].trigger('hover:enter');
    env.manifests[1].onContextLauch(movie);
    assert.deepEqual(env.pushes[0], env.pushes[1]);
    assert.equal(env.pushes[0].movie, movie);
    assert.equal(env.pushes[0].movie.original_title, 'Original');
    assert.equal(env.pushes[0].movie.release_date, '2021-07-06');
    assert.equal(env.pushes[0].search, 'Назва');
    assert.equal(env.pushes[0].page, 1);
    assert.equal(env.pushes[0].title, 'ZebMod');
});

test('series source preserves names, year, type, seasons and original card identity', () => {
    const env = harness();
    const movie = { id: 18, name: 'Серіал', original_name: 'Series', first_air_date: '2019-02-03',
        type: 'tv', number_of_seasons: 3, seasons: [{ season_number: 1 }] };
    const card = fullCard(env, movie).complete();
    card.online[0].trigger('hover:enter');
    const payload = env.pushes[0];
    assert.equal(payload.movie, movie);
    assert.equal(payload.search, 'Серіал');
    assert.equal(payload.movie.original_name, 'Series');
    assert.equal(payload.movie.first_air_date, '2019-02-03');
    assert.equal(payload.movie.type, 'tv');
    assert.equal(payload.movie.number_of_seasons, 3);
    assert.equal(payload.movie.seasons, movie.seasons);
    env.open(payload.movie);
    assert.equal(new URL(env.requests.at(-1).params.url).searchParams.get('story'), 'Серіал');
    env.response([{ id: 18, title: 'Серіал' }]);
    assert.match(env.text, /2019/);
});

test('source supports original-only and empty-title cards just like the context launcher', () => {
    const env = harness();
    for (const movie of [{ original_title: 'Original film' }, { original_name: 'Original series' }, {}]) {
        const card = fullCard(env, movie).complete();
        card.online[0].trigger('hover:enter');
        env.manifests[1].onContextLauch(movie);
        assert.deepEqual(env.pushes.at(-1), env.pushes.at(-2));
        assert.equal(env.pushes.at(-1).search, movie.original_title || movie.original_name || '');
    }
});

test('reused card DOM updates the source handler to the new movie', () => {
    const env = harness(), card = fullCard(env).complete(), button = card.online[0];
    const next = { name: 'Інший серіал', original_name: 'Next series', first_air_date: '2025-01-01' };
    card.event.data = { movie: next };
    card.complete(); button.trigger('hover:enter');
    assert.equal(card.online[0], button);
    assert.equal(env.pushes.length, 1);
    assert.equal(env.pushes[0].movie, next);
});

test('different full-card activities keep independent source handlers and movie data', () => {
    const env = harness(), first = fullCard(env, { title: 'Перший' }).complete();
    const second = fullCard(env, { name: 'Другий' }).complete();
    first.complete(); second.complete();
    first.online[0].trigger('hover:enter'); second.online[0].trigger('hover:enter');
    assert.equal(first.online.length, 1); assert.equal(second.online.length, 1);
    assert.equal(env.pushes[0].search, 'Перший'); assert.equal(env.pushes[1].search, 'Другий');
});

test('reopening the same film in new DOM creates exactly one local source', () => {
    const env = harness(), movie = { id: 1, title: 'Повторний' };
    for (let i = 0; i < 5; i++) {
        const card = fullCard(env, movie).complete();
        card.complete();
        assert.equal(card.online.length, 1);
        card.online[0].trigger('hover:enter');
        assert.equal(env.pushes.at(-1).movie, movie);
    }
    assert.equal(env.listeners.filter(x => x.type === 'full').length, 1);
    assert.equal(env.pushes.length, 5);
});

test('standard Watch handler opens a single source item on every panel reopen', () => {
    const env = harness(), card = fullCard(env), nativeWatch = card.watch.events['hover:enter.nativeWatch'];
    card.complete(); card.restore();
    for (let i = 0; i < 5; i++) {
        card.watch.trigger('hover:enter');
        assert.equal(card.panel.children.length, 5);
        assert.equal(card.online.length, 1);
        env.back();
        assert.equal(env.focus, card.watch);
    }
    assert.equal(card.watch.events['hover:enter.nativeWatch'], nativeWatch);
    assert.equal(env.pushes.length, 0);
});

test('native source panel Up/Down and OK launch ZebMod without replacing controllers', () => {
    const env = harness(), card = fullCard(env).complete();
    card.restore(); card.watch.trigger('hover:enter');
    const controller = env.Lampa.Controller.enabled().controller;
    controller.down(); assert.equal(card.panelIndex, 1);
    controller.up(); assert.equal(card.panelIndex, 0);
    controller.down(); env.focus.trigger('hover:enter');
    assert.equal(env.pushes.length, 1);
    assert.equal(env.pushes[0].movie, card.event.data.movie);
    assert.equal(env.Lampa.Controller.enabled().controller, controller);
});

test('Back from source-launched search delegates to Activity and restores the native card focus', () => {
    const env = harness(), card = fullCard(env).complete();
    const push = env.Lampa.Activity.push, backward = env.Lampa.Activity.backward;
    env.Lampa.Activity.push = value => { push(value); env.open(value.movie); };
    // Model the host activity stack: the plugin must call backward; the host
    // resumes its own controller/last focus. Actual Android focus is NOT VERIFIED.
    env.Lampa.Activity.backward = () => { backward(); card.restore(); };
    card.restore(); card.selectOnline();
    assert.equal(env.pushes.length, 1);
    const pending = env.requests.at(-1);
    env.back();
    assert.equal(env.backward, 1);
    assert.equal(pending.aborted, true);
    assert.equal(env.focus, card.watch);
    env.response([{ id: 1, title: 'Late response' }], pending);
    assert.equal(env.focus, card.watch);
    card.complete();
    assert.equal(card.online.length, 1);
    card.watch.trigger('hover:enter');
    assert.equal(card.panel.children.length, 5);
    card.buttons[0].trigger('hover:enter');
    assert.deepEqual(card.visits, ['Торренти']);
    env.back();
    assert.equal(env.focus, card.watch);
    card.selectOnline();
    assert.equal(env.pushes.length, 2);
    env.back();
    assert.equal(env.backward, 2);
});

test('other sources keep order, handlers and availability including sources added later', () => {
    const env = harness(), card = fullCard(env);
    const original = [...card.buttons], handlers = original.map(button => ({ ...button.events }));
    const controller = { back() {} };
    env.Lampa.Controller.add('content', controller); env.Lampa.Controller.toggle('content');
    card.complete(); card.complete();
    assert.equal(env.Lampa.Controller.enabled().controller, controller);
    assert.deepEqual(card.buttons.filter(button => button !== card.online[0]), original);
    for (const [index, button] of original.entries()) {
        assert.deepEqual(button.events, handlers[index]);
        button.trigger('hover:enter');
    }
    assert.deepEqual(card.visits, ['Торренти', 'Shots', 'Трейлер', 'Інший онлайн']);
    card.source('view--external', 'Пізніше джерело');
    card.watch.trigger('hover:enter');
    assert.equal(card.panel.children.length, 6);
    assert.equal(env.pushes.length, 0);
    assert.equal(env.requests.length, 0);
});

const INSTALL_URL = 'https://zwanns.github.io/zeb.js';

test('public manifest is ZebMod v0.1.4 with the original component identifier', () => {
    const env = harness(), manifest = env.manifests[1];
    assert.equal(manifest.name, 'ZebMod');
    assert.equal(manifest.version, '0.1.4');
    assert.equal(manifest.type, 'video');
    assert.equal(manifest.component, COMPONENT);
    assert.equal(env.context.__lampa_online_loaded, true);
    assert.equal(env.context.__zebmod_loaded, undefined);
    assert.equal(env.manifests[0], env.unrelatedPlugin);
});

test('settings display ZebMod while keeping the existing component and all four storage keys', () => {
    const env = harness();
    assert.equal(env.settingComponents[0].name, 'ZebMod');
    assert.equal(env.settingComponents[0].component, 'lampa_online_settings');
    assert.deepEqual(env.settings.map(setting => setting.param.name), [
        'lampa_online_api_url', 'lampa_online_token', 'lampa_online_proxy', 'lampa_online_device_id'
    ]);
    assert.ok(env.settings.every(setting => setting.component === 'lampa_online_settings'));
});

test('uk, ru and en use ZebMod for the context menu, activity title, screen heading and source', () => {
    for (const [language, watch] of Object.entries({
        uk: 'Дивитися через ZebMod', ru: 'Смотреть через ZebMod', en: 'Watch via ZebMod'
    })) {
        const env = harness({ language }), card = fullCard(env).complete();
        assert.equal(env.Lampa.Lang.translate('lampa_online_name'), 'ZebMod');
        assert.equal(env.manifests[1].onContextMenu().name, watch);
        assert.match(card.online[0].html, /<span>ZebMod<\/span>/);
        assert.doesNotMatch(card.online[0].html, /Lampa Online/);
        card.online[0].trigger('hover:enter');
        assert.equal(env.pushes[0].title, 'ZebMod');
        env.open(env.pushes[0].movie);
        assert.match(env.text, /ZebMod · Filmix/);
        env.response([{ id: 1, title: 'Movie' }]);
        assert.match(env.text, /ZebMod · Filmix/);
        env.enter(1); env.response({ player_links: { movie: [stream] } });
        assert.match(env.text, /ZebMod · Filmix/);
    }
});

test('ZebMod source keeps its technical class and one launch across ready, reload and repeated completion', () => {
    const env = harness(), card = fullCard(env).complete();
    for (let i = 0; i < 10; i++) { env.ready(); env.load(); card.complete(); }
    assert.equal(card.online.length, 1);
    assert.match(card.online[0].html, /view--lampa-online/);
    assert.match(card.online[0].html, /<span>ZebMod<\/span>/);
    assert.equal(env.listeners.filter(listener => listener.type === 'full').length, 1);
    assert.equal(env.settingComponents.length, 1);
    assert.equal(env.manifests.length, 2);
    card.online[0].trigger('hover:enter');
    assert.equal(env.pushes.length, 1);
    assert.equal(env.pushes[0].title, 'ZebMod');
});

test('installed extension name updates only the exact own URL in live and persisted lists', () => {
    const own = { url: INSTALL_URL, name: 'Lampa Online', status: 1, author: 'Existing author', descr: 'Keep description' };
    const other = { url: 'https://other.example/plugin.js?PRIVATE_VALUE', name: 'Lampa Online', status: 0, nested: { keep: true } };
    const installed = [other, own];
    const storage = { plugins: JSON.parse(JSON.stringify(installed)) };
    // The fresh stored list may have newer unrelated metadata than Plugins.get().
    storage.plugins[0].descr = 'Fresh metadata';
    const expectedOther = JSON.stringify(storage.plugins[0]);
    const env = harness({ installed, storage });
    assert.equal(own.name, 'ZebMod');
    assert.equal(other.name, 'Lampa Online');
    assert.equal(storage.plugins[1].name, 'ZebMod');
    assert.equal(JSON.stringify(storage.plugins[0]), expectedOther);
    assert.equal(storage.plugins[1].author, 'Existing author');
    assert.equal(storage.plugins[1].descr, 'Keep description');
    assert.equal(storage.plugins[1].status, 1);
    assert.equal(storage.plugins[1].url, INSTALL_URL);
    assert.equal(env.Lampa.Plugins.get().reverse()[0].name, 'ZebMod', 'native installed cards read data.name from Plugins.get()');
    assert.equal(env.storageWrites.filter(write => write.key === 'plugins').length, 1);
    assert.equal(env.requests.length, 0);
    assert.doesNotMatch(JSON.stringify(env.logs), /PRIVATE_VALUE|https?:|Fresh metadata/);
});

test('old user configuration survives the rename, including exact tokens and leading-zero device IDs', () => {
    const storage = {
        lampa_online_api_url: 'https://existing.example/api/v2/', lampa_online_token: 'synthetic-old-token',
        lampa_online_proxy: 'https://proxy.example/', lampa_online_device_id: '00001234567890123456',
        video_quality_default: '1080', unrelated_setting: { retained: true },
        plugins: [{ url: INSTALL_URL, name: 'Lampa Online', status: 1 }]
    };
    const original = JSON.parse(JSON.stringify(storage));
    const installed = JSON.parse(JSON.stringify(storage.plugins));
    const env = harness({ storage, installed, coerceStorage: true });
    const expected = { ...original, plugins: [{ ...original.plugins[0], name: 'ZebMod' }] };
    assert.deepEqual(JSON.parse(JSON.stringify(storage)), expected);
    assert.deepEqual(env.storageWrites.map(write => write.key), ['plugins']);
    env.open({ title: 'Назва' });
    const url = new URL(env.requests[0].params.url.slice('https://proxy.example/'.length));
    assert.equal(url.searchParams.get('user_dev_token'), original.lampa_online_token);
    assert.equal(url.searchParams.get('user_dev_id'), original.lampa_online_device_id);
    assert.equal(url.pathname, '/api/v2/user_profile');
    assert.ok(Object.keys(storage).every(key => !key.startsWith('zebmod_')));
});

test('installed rename is idempotent across duplicate initialization and a persisted restart', () => {
    const storage = { plugins: [{ url: INSTALL_URL, name: 'Lampa Online', status: 1 }] };
    const installed = JSON.parse(JSON.stringify(storage.plugins));
    const first = harness({ storage, installed });
    first.ready(); first.load(); first.ready(); first.load();
    assert.equal(first.storageWrites.filter(write => write.key === 'plugins').length, 1);
    assert.equal(storage.plugins.length, 1);
    const persisted = JSON.parse(JSON.stringify(storage));
    const second = harness({ storage: persisted, installed: persisted.plugins });
    assert.equal(second.storageWrites.filter(write => write.key === 'plugins').length, 0);
    assert.equal(second.Lampa.Plugins.get()[0].name, 'ZebMod');
    assert.equal(second.manifests.length, 2);
    assert.equal(second.settingComponents.length, 1);
});

test('installed rename never guesses identity from names, URL substrings, query variants or other hosts', () => {
    const entries = [
        { url: 'https://other.example/zeb.js', name: 'ZebMod' },
        { url: 'https://other.example/lampa-online.js', name: 'Lampa Online' },
        { url: 'http://zwanns.github.io/zeb.js', name: 'Lampa Online' },
        { url: INSTALL_URL + '?cache=1', name: 'Lampa Online' },
        { url: INSTALL_URL + '#fragment', name: 'Lampa Online' },
        { url: INSTALL_URL + '.other.js', name: 'Lampa Online' },
        { url: 'https://zwanns.github.io.evil.example/zeb.js', name: 'Lampa Online' },
        { link: INSTALL_URL, name: 'Lampa Online' }
    ];
    const original = JSON.stringify(entries);
    const storage = { plugins: JSON.parse(original) };
    const env = harness({ installed: entries, storage });
    assert.equal(JSON.stringify(entries), original);
    assert.equal(JSON.stringify(storage.plugins), original);
    assert.equal(env.storageWrites.filter(write => write.key === 'plugins').length, 0);
    assert.equal(env.manifests[1].name, 'ZebMod');
});

test('installed rename requires an own record in both lists and skips ambiguous duplicates', () => {
    const own = { url: INSTALL_URL, name: 'Lampa Online', status: 1 };
    for (const [live, stored] of [
        [[], [own]], [[own], []], [[own, own], [own]], [[own], [own, own]]
    ]) {
        const installed = JSON.parse(JSON.stringify(live)), storage = { plugins: JSON.parse(JSON.stringify(stored)) };
        const beforeLive = JSON.stringify(installed), beforeStored = JSON.stringify(storage.plugins);
        const env = harness({ installed, storage });
        assert.equal(JSON.stringify(installed), beforeLive);
        assert.equal(JSON.stringify(storage.plugins), beforeStored);
        assert.equal(env.storageWrites.filter(write => write.key === 'plugins').length, 0);
        assert.equal(env.manifests[1].name, 'ZebMod');
    }
});

test('missing host API and malformed installed lists do not prevent ZebMod startup or rewrite storage', () => {
    for (const [pluginsApi, value] of [
        [{}, []], [{ get: 'incompatible' }, []], [{ get: () => null }, []],
        [{ get: () => ({ url: INSTALL_URL }) }, []],
        [{ get: () => [{ url: INSTALL_URL }] }, 'malformed'],
        [{ get: () => [{ url: INSTALL_URL }] }, null],
        [{ get() { throw new Error('PRIVATE host error'); } }, []]
    ]) {
        const storage = { plugins: value };
        const env = harness({ pluginsApi, storage });
        assert.equal(storage.plugins, value);
        assert.equal(env.storageWrites.filter(write => write.key === 'plugins').length, 0);
        assert.equal(env.manifests[1].name, 'ZebMod');
        assert.equal(env.settingComponents[0].name, 'ZebMod');
        assert.doesNotMatch(JSON.stringify(env.logs), /PRIVATE/);
    }
});

test('failed installed metadata persistence leaves the live record intact and the plugin usable', () => {
    const installed = [{ url: INSTALL_URL, name: 'Lampa Online', status: 1 }];
    const storage = { plugins: JSON.parse(JSON.stringify(installed)) };
    const env = harness({ installed, storage, storageWriteFails: true });
    assert.equal(installed[0].name, 'Lampa Online');
    assert.equal(storage.plugins[0].name, 'Lampa Online');
    assert.equal(env.manifests[1].name, 'ZebMod');
    fullCard(env).complete().online[0].trigger('hover:enter');
    assert.equal(env.pushes[0].title, 'ZebMod');
});

test('installed rename keeps global host methods unchanged and never calls plugin save, push or add', () => {
    const installed = [{ url: INSTALL_URL, name: 'Lampa Online', status: 1 }];
    const pluginsApi = {
        get() { return installed.slice(); },
        save() { assert.fail('must not log all plugins'); },
        push() { assert.fail('must not reload the plugin'); },
        add() { assert.fail('must not duplicate the plugin'); }
    };
    const methods = { ...pluginsApi }, storage = { plugins: JSON.parse(JSON.stringify(installed)) };
    const env = harness({ pluginsApi, storage });
    for (const key of Object.keys(methods)) assert.equal(env.Lampa.Plugins[key], methods[key]);
    assert.equal(installed[0].name, 'ZebMod');
    assert.equal(env.requests.length, 0);
    assert.equal(env.storageWrites.filter(write => write.key === 'plugins').length, 1);
});

const formatFixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'filmix', 'formats.json'), 'utf8'));
const detailLogs = env => env.logs.map(args => args[0]).filter(line => line.startsWith('LampaOnline | diagnostic | '));
const diagnosticText = env => env.scrolls.at(-1).root.children
    .filter(el => el.html === '<div class="lampa-online-diagnostic"></div>')
    .map(el => env.label(el)).join(' | ');

for (const [status, kind, explanation] of [
    [0, 'error', /Причину не визначено.*мережа.*DNS.*CORS.*TLS/],
    [401, 'error', /401\/403/], [403, 'error', /401\/403/], [404, 'error', /404/],
    [429, 'error', /429/], [500, 'error', /5xx/], [0, 'timeout', /вчасно/],
    [200, 'parsererror', /некоректний JSON/]
]) test(`TV diagnostics show allowlisted search metadata for ${status}/${kind}`, () => {
    const env = harness(); env.open(); env.advance(1200); env.error(status, kind);
    const text = diagnosticText(env);
    assert.match(text, /Етап: search/);
    assert.match(text, /Transport: WebView AJAX/);
    assert.ok(text.includes('HTTP: ' + status));
    assert.ok(text.includes('Error: ' + kind));
    assert.match(text, /Час: 1200 ms/);
    assert.match(text, explanation);
    assert.match(env.label(env.focus), /повтору/);
    assert.equal(env.rows.length, 2, 'diagnostic text does not add extra navigation targets');
    assert.equal(env.loading, false);
    assert.ok(detailLogs(env)[0].includes('transport=ajax http=' + status + ' error=' + kind + ' elapsed_ms=1200'));
    env.enter(1); assert.equal(env.requests.length, 2);
    assert.equal(diagnosticText(env), '', 'retry clears the previous failure');
    env.advance(35); env.error(0);
    assert.match(diagnosticText(env), /Час: 35 ms/);
});

test('actual malformed JSON retains HTTP status, elapsed time and separate JSON/Filmix flags on TV', () => {
    const env = harness(); env.open(); env.advance(41);
    env.response('<html>PRIVATE_RESPONSE</html>', undefined, 502);
    assert.match(diagnosticText(env), /HTTP: 502.*Error: parsererror.*Час: 41 ms.*JSON: false · Filmix: false/);
    assert.doesNotMatch(diagnosticText(env), /PRIVATE_RESPONSE|<html>/);
    assert.match(detailLogs(env)[0], /http=502 error=parsererror elapsed_ms=41 json=false filmix=false$/);
});

test('valid JSON with unexpected search/post shape is reported as a response format issue', () => {
    const env = harness(); env.open(); env.advance(10); env.response({ private: 'PRIVATE_BODY' });
    assert.match(diagnosticText(env), /HTTP: 200.*Error: none.*JSON: true · Filmix: false/);
    assert.match(diagnosticText(env), /Неочікуваний формат/);
    assert.doesNotMatch(diagnosticText(env), /PRIVATE_BODY|Причину не визначено/);
    env.enter(1); env.response(formatFixtures.search); env.enter(1);
    env.response({ player_links: [] });
    assert.match(diagnosticText(env), /Етап: post.*JSON: true · Filmix: false.*Неочікуваний формат/);
    assert.equal(env.rows.length, 2, 'malformed post envelope retains a retry row');
});

test('post errors display the correct stage and Back restores the selected cached result', () => {
    const env = harness(); env.open(); env.response([{ id: 1 }, { id: 2 }]); env.enter(2);
    env.advance(271); env.error(429);
    assert.match(diagnosticText(env), /Етап: post.*HTTP: 429.*Час: 271 ms/);
    const count = env.requests.length;
    env.back();
    assert.equal(diagnosticText(env), '');
    assert.match(env.label(env.focus), /ID 2/);
    assert.equal(env.requests.length, count);
});

test('profile failures remain visible without console while guest search continues and can be retried', () => {
    const env = harness({ storage: { lampa_online_token: 'SYNTHETIC_PRIVATE_TOKEN' } }); env.open();
    env.advance(212); env.error(403);
    assert.match(diagnosticText(env), /Етап: user_profile.*HTTP: 403.*Час: 212 ms/);
    assert.equal(env.requests.length, 2, 'guest search still proceeds');
    env.response(formatFixtures.search);
    assert.match(diagnosticText(env), /Етап: user_profile/);
    const retryIndex = env.rows.findIndex(row => /Повторити user_profile/.test(env.label(row)));
    assert.ok(retryIndex > 1, 'profile retry follows ordinary results');
    env.enter(retryIndex);
    assert.equal(new URL(env.requests.at(-1).params.url).pathname, '/api/v2/user_profile');
    assert.equal(diagnosticText(env), '');
    env.response(formatFixtures.profile);
    assert.equal(new URL(env.requests.at(-1).params.url).pathname, '/api/v2/search');
    env.response(formatFixtures.search);
    assert.equal(diagnosticText(env), '');
    assert.ok(env.rows.every(row => !/Повторити user_profile/.test(env.label(row))));
});

test('invalid profile shape stays distinct from failed parsing and profile/search diagnostics coexist', () => {
    const env = harness({ storage: { lampa_online_token: 'SYNTHETIC_PRIVATE_TOKEN' } }); env.open();
    env.response({ unexpected: 'PRIVATE_PROFILE' }); env.advance(111); env.error(0);
    const text = diagnosticText(env);
    assert.match(text, /Етап: user_profile.*JSON: true · Filmix: false/);
    assert.match(text, /Етап: search.*Час: 111 ms.*Причину не визначено/);
    assert.equal(env.scrolls.at(-1).root.children.filter(el => el.html === '<div class="lampa-online-diagnostic"></div>').length, 2);
    assert.doesNotMatch(text, /PRIVATE_PROFILE|SYNTHETIC_PRIVATE_TOKEN/);
});

test('Back during profile retry from sources closes the screen and suppresses the pending profile', () => {
    const env = harness({ storage: { lampa_online_token: 'SYNTHETIC_TOKEN' } }); env.open();
    env.error(403); env.response(formatFixtures.search); env.enter(1); env.response(formatFixtures.movieArray);
    const retryIndex = env.rows.findIndex(row => /Повторити user_profile/.test(env.label(row)));
    assert.ok(retryIndex > 1);
    env.enter(retryIndex);
    const pending = env.requests.at(-1), count = env.requests.length;
    env.back();
    assert.equal(env.backward, 1);
    assert.equal(pending.aborted, true);
    env.response(formatFixtures.profile, pending);
    assert.equal(env.requests.length, count);
    assert.equal(env.timers.size, 0);
});

test('TV diagnostic content and all logs exclude URLs, auth, cookies, headers and raw exceptions', () => {
    const env = harness({ storage: {
        lampa_online_api_url: 'https://PRIVATE_API.example/api/v2/',
        lampa_online_proxy: 'https://PRIVATE_PROXY.example/',
        lampa_online_token: 'PRIVATE_TOKEN', lampa_online_device_id: 'PRIVATE_DEVICE'
    } });
    env.open({ title: 'Safe title' });
    env.requests[0].params.error({ status: 0, responseText: 'PRIVATE_BODY',
        message: 'PRIVATE_EXCEPTION', cookie: 'PRIVATE_COOKIE', headers: { Authorization: 'PRIVATE_HEADER' } }, 'PRIVATE_ERROR');
    env.requests[1].params.error({ status: 0, responseText: 'PRIVATE_BODY' }, 'PRIVATE_ERROR');
    const output = diagnosticText(env) + JSON.stringify(env.logs) + JSON.stringify(env.notices);
    assert.doesNotMatch(output, /PRIVATE|https?:|user_dev_|Authorization|cookie|responseText/);
    assert.match(output, /Error: error/);
});

test('unrecognized configuration exceptions never display exception messages or fabricated network diagnostics', () => {
    const env = harness();
    const original = env.Lampa.Storage.get;
    env.Lampa.Storage.get = function (key, fallback) {
        if (key === 'lampa_online_api_url') throw new Error('PRIVATE_EXCEPTION https://private.example/?token=secret');
        return original(key, fallback);
    };
    env.open();
    assert.equal(env.requests.length, 0);
    assert.equal(diagnosticText(env), '');
    assert.match(env.text, /Некоректна адреса/);
    assert.doesNotMatch(env.text + JSON.stringify(env.logs), /PRIVATE|private\.example|token=secret/);
});

test('watchdog records elapsed timeout once and suppresses late diagnostics', () => {
    const env = harness(); env.open(); const pending = env.requests[0];
    env.advance(15000);
    assert.match(diagnosticText(env), /Error: timeout.*Час: 15000 ms/);
    assert.equal(pending.aborted, true);
    const saved = diagnosticText(env) + JSON.stringify(env.logs);
    env.response(formatFixtures.search, pending); env.error(500, 'error', pending);
    assert.equal(diagnosticText(env) + JSON.stringify(env.logs), saved);
    assert.equal(detailLogs(env).length, 1);
});

for (const profile of [false, true]) test('destroy cancels requests without late TV updates: profile=' + profile, () => {
    const env = harness({ storage: profile ? { lampa_online_token: 'SYNTHETIC_TOKEN' } : {} });
    const screen = env.open(), pending = env.requests[0]; env.advance(321);
    screen.destroy();
    assert.match(detailLogs(env)[0], /error=abort elapsed_ms=321 json=unknown filmix=unknown$/);
    assert.equal(diagnosticText(env), '');
    const saved = JSON.stringify(env.logs);
    env.response(formatFixtures.search, pending); env.advance(20000);
    assert.equal(JSON.stringify(env.logs), saved);
    assert.equal(env.timers.size, 0);
});

test('an external abort is classified without claiming CORS or TLS and remains retryable', () => {
    const env = harness(); env.open(); env.advance(20); env.requests[0].abort();
    assert.match(diagnosticText(env), /Error: abort.*Час: 20 ms.*скасовано/);
    assert.doesNotMatch(diagnosticText(env), /Причину не визначено/);
    env.enter(1); assert.equal(env.requests.length, 2);
});

test('Back from a TV diagnostic returns via the existing Activity stack', () => {
    const env = harness(); env.open(); env.error(0);
    env.back();
    assert.equal(env.backward, 1);
    assert.equal(env.timers.size, 0);
    assert.equal(env.scrolls[0].destroyed, true);
});

test('TV diagnostics do not steal focus from an active host menu and resume on return', () => {
    const env = harness(); env.open(); env.Lampa.Controller.toggle('menu');
    const saved = env.focus; env.error(0);
    assert.equal(env.Lampa.Controller.enabled().name, 'menu');
    assert.equal(env.focus, saved);
    env.Lampa.Controller.toggle('content');
    assert.match(env.label(env.focus), /повтору/);
});

test('diagnostic status and elapsed fields are bounded even for invalid host values', () => {
    const env = harness(); env.context.performance.now = () => Infinity;
    env.open(); env.error(9999, 'PRIVATE_KIND');
    assert.match(diagnosticText(env), /HTTP: 0.*Error: error.*Час: 0 ms/);
    assert.doesNotMatch(diagnosticText(env) + JSON.stringify(env.logs), /9999|Infinity|PRIVATE_KIND/);
});

test('diagnostics keep settings, AJAX transport, default host and source registration unchanged', () => {
    const storage = { lampa_online_token: '', lampa_online_device_id: '0000000000000012', unrelated: true };
    const snapshot = { ...storage }, env = harness({ storage });
    const card = fullCard(env).complete(); env.open(); env.error(0); env.enter(1); env.error(500);
    env.load(); env.ready(); card.complete();
    assert.deepEqual(storage, snapshot);
    assert.equal(card.online.length, 1);
    assert.equal(env.listeners.filter(entry => entry.type === 'full').length, 1);
    assert.equal(env.settingComponents.length, 1);
    for (const request of env.requests) {
        assert.ok(request.params.url.startsWith('https://filmixapp.cyou/api/v2/'));
        assert.equal(request.params.type, 'GET');
        assert.equal(request.params.global, false);
        assert.equal(request.params.headers, undefined);
    }
    assert.equal(env.manifests[1].version, '0.1.4');
});

function fixturePost(name) {
    const env = harness(); env.open(); env.response(formatFixtures.search); env.enter(1);
    env.response(formatFixtures[name]); return env;
}

for (const name of ['movieArray', 'bracketWithoutQualities', 'plainWithoutQualities']) {
    test('synthetic format fixture plays only declared/supplied media: ' + name, () => {
        const env = fixturePost(name); env.enter(1);
        const item = env.Lampa.Player.items[0];
        assert.ok(item);
        if (name === 'plainWithoutQualities') {
            assert.equal(item.url, 'https://media.example/plain.mp4');
            assert.equal(item.quality, undefined);
        } else {
            assert.equal(item.url, 'https://media.example/movie_480.mp4');
            assert.deepEqual(Object.keys(item.quality), ['480p']);
        }
    });
}

test('movie Object fixture exposes the current parser limitation without inventing playback URLs', () => {
    const env = fixturePost('movieObject');
    assert.equal(env.Lampa.Player.items.length, 0);
    assert.equal(env.rows.length, 1);
    assert.match(diagnosticText(env), /Етап: post.*HTTP: 200.*Error: none.*JSON: true · Filmix: true/);
    assert.match(diagnosticText(env), /movie як Object.*лише як Array.*обмеження клієнта/);
    assert.equal(env.requests.length, 2);
});

for (const name of ['emptyArray', 'emptyObject', 'blocked']) {
    test('empty or blocked fixture never launches a player: ' + name, () => {
        const env = fixturePost(name);
        assert.equal(env.rows.length, 1);
        assert.equal(env.Lampa.Player.items.length, 0);
        assert.equal(env.loading, false);
    });
}

for (const name of ['percentWithoutQualities', 'missingStream']) {
    test('missing declared quality or stream cannot invent a URL: ' + name, () => {
        const env = fixturePost(name); env.enter(1);
        assert.equal(env.Lampa.Player.items.length, 0);
        assert.match(env.notices.at(-1), /Немає доступного/);
    });
}

for (const [name, numbers] of [['numericEpisodes', [2,10]], ['arrayEpisodes', [1,2]]]) {
    test('series fixture keeps numeric episodes and explicit percent-template qualities: ' + name, () => {
        const env = fixturePost(name); env.enter(1);
        assert.deepEqual(env.rows.slice(1).map(row => parseInt(env.label(row).match(/Серія (\d+)/)[1])), numbers);
        env.enter(1);
        const playlist = env.Lampa.Player.playlists[0];
        assert.equal(playlist.length, 2);
        assert.deepEqual(Array.from(playlist, item => item.episode), numbers);
        assert.ok(playlist.every(item => /_480\.mp4$/.test(item.url)));
        assert.ok(playlist.every(item => Object.keys(item.quality).join() === '480p'));
    });
}
