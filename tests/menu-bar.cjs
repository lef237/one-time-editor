const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// IPC as sent by the bundled editor page that the main process loads.
const appEvent = { senderFrame: { url: 'file:///app/dist/index.html' } };

// Exercise the real main process with an in-memory Electron host, without
// opening windows, touching the clipboard, or changing the user's notes.
async function launch(platform = 'darwin', initialConfig = null) {
  const windows = [], trays = [], shortcuts = new Map(), ipcHandlers = new Map(), writes = [];
  const app = new EventEmitter();
  Object.assign(app, {
    getPath: () => '/test-data', whenReady: () => Promise.resolve(),
    dock: {
      hidden: false,
      hide() { this.hidden = true; app.dockHidden = true; },
      show() { this.hidden = false; app.dockHidden = false; return Promise.resolve(); },
    },
    hide() { app.hidden = true; windows.forEach(w => w.hide()); },
    quit() { app.emit('before-quit'); app.emit('will-quit'); app.quitCalled = true; }
  });
  class Window extends EventEmitter {
    constructor() {
      super(); this.visible = false; windows.push(this);
      this.webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler(handler) { this.windowOpenHandler = handler; } });
      app.emit('web-contents-created', {}, this.webContents);
    }
    loadFile() { this.emit('ready-to-show'); }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() {}
    isVisible() { return this.visible; }
    isMinimized() { return !!this.minimized; }
    restore() { this.minimized = false; }
    close() {
      let prevented = false;
      this.emit('close', { preventDefault() { prevented = true; } });
      if (!prevented) { this.destroyed = true; this.emit('closed'); }
    }
  }
  class Tray extends EventEmitter {
    constructor() { super(); trays.push(this); }
    setToolTip() {}
    setContextMenu(menu) { this.menu = menu; }
    destroy() { this.destroyed = true; }
  }
  const electron = {
    app, BrowserWindow: Window, Tray,
    Menu: { buildFromTemplate: value => value },
    nativeImage: { createFromDataURL: () => ({ resize() { return this; }, setTemplateImage() {}, isEmpty() { return false; } }) },
    globalShortcut: { unregisterAll: () => shortcuts.clear(), register: (key, fn) => { shortcuts.set(key, fn); return true; } },
    ipcMain: { handle: (name, handler) => ipcHandlers.set(name, handler) }, clipboard: { writeText() {} }
  };
  const fsMock = {
    existsSync: file => initialConfig !== null && file === '/test-data/config.json',
    readFileSync: file => file === '/test-data/config.json' ? JSON.stringify(initialConfig) : '',
    writeFileSync: (file, data) => writes.push({ file, data }),
  };
  const source = fs.readFileSync(path.join(__dirname, '../electron/main.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, {
    require: name => name === 'electron' ? electron : name === 'node:fs' ? fsMock : require(name),
    exports: {}, __dirname: '/app/dist-electron', process: { platform, env: {} }, console
  });
  await Promise.resolve();
  return { app, windows, trays, shortcuts, ipcHandlers, writes };
}

test('Dock mode is the default and keeps the Dock icon without a menu-bar entry', async () => {
  const { app, trays } = await launch();
  assert.equal(trays.length, 0);
  assert.equal(app.dockHidden, false);
});
test('Mac menu-bar mode removes the Dock icon and provides a menu-bar entry', async () => {
  const { app, trays } = await launch('darwin', { showInMenuBar: true });
  assert.equal(trays.length, 1);
  assert.equal(app.dockHidden, true);
  assert.ok(trays[0].menu.some(item => item.label === 'Quit One-Time Editor'));
});
test('closing a menu-bar Mac window preserves it and Control+J brings it back', async () => {
  const { windows, shortcuts } = await launch('darwin', { showInMenuBar: true });
  const window = windows[0];
  window.close();
  assert.ok(!window.destroyed, 'closing must preserve the current draft window');
  assert.equal(window.visible, false);
  shortcuts.get('Control+J')();
  assert.equal(windows.length, 1);
  assert.equal(window.visible, true);
});
test('closing a preserved menu-bar window does not duplicate the draft in history', async () => {
  const { app, windows, ipcHandlers, writes } = await launch('darwin', { showInMenuBar: true });
  await ipcHandlers.get('sync-text')(appEvent, 'draft');
  windows[0].close();
  windows[0].show();
  windows[0].close();
  assert.equal(writes.length, 0, 'hiding the preserved window must not save the draft');
  app.quit();
  assert.equal(writes.length, 1, 'quitting must save the draft exactly once');
  assert.equal(JSON.parse(writes[0].data)[0].text, 'draft');
});
test('closing a Dock-mode Mac window destroys it and saves the draft', async () => {
  const { windows, ipcHandlers, writes } = await launch();
  await ipcHandlers.get('sync-text')(appEvent, 'draft');
  windows[0].close();
  assert.equal(windows[0].destroyed, true);
  assert.equal(writes.length, 1);
});
test('menu can toggle the editor and quit the background app', async () => {
  const { app, trays, windows } = await launch('darwin', { showInMenuBar: true });
  assert.equal(trays.length, 1);
  const toggle = trays[0].menu.find(item => item.label === 'Show / Hide Editor');
  toggle.click();
  assert.equal(windows[0].visible, false);
  toggle.click();
  assert.equal(windows[0].visible, true);
  trays[0].menu.find(item => item.label === 'Quit One-Time Editor').click();
  assert.equal(app.quitCalled, true);
  windows[0].close();
  assert.equal(windows[0].destroyed, true, 'Quit must not be intercepted as hide');
});
test('non-Mac platforms retain their existing close behavior', async () => {
  const { app, trays, windows } = await launch('win32', { showInMenuBar: true });
  assert.equal(trays.length, 0);
  assert.ok(!app.dockHidden);
  windows[0].close();
  assert.equal(windows[0].destroyed, true);
});

test('Mac shortcut hides the application to return focus to the previous app', async () => {
  const { app, shortcuts, windows } = await launch('darwin', { showInMenuBar: true });
  shortcuts.get('Control+J')();
  assert.equal(app.hidden, true);
  assert.equal(windows[0].visible, false);
});
test('shortcut restores a minimized editor', async () => {
  const { shortcuts, windows } = await launch();
  windows[0].minimized = true;
  shortcuts.get('Control+J')();
  assert.equal(windows[0].minimized, false);
  assert.equal(windows[0].visible, true);
});
test('enabling the menu-bar preference from settings creates the tray and hides the Dock', async () => {
  const { app, trays, ipcHandlers, writes } = await launch();
  assert.equal(trays.length, 0);
  const applied = await ipcHandlers.get('set-show-in-menu-bar')(appEvent, true);
  assert.equal(applied, true);
  assert.equal(trays.length, 1);
  assert.equal(app.dockHidden, true);
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(writes[0].data).showInMenuBar, true);
});
test('disabling the menu-bar preference from settings restores the Dock and removes the tray', async () => {
  const { app, trays, ipcHandlers, writes } = await launch('darwin', { showInMenuBar: true });
  const applied = await ipcHandlers.get('set-show-in-menu-bar')(appEvent, false);
  assert.equal(applied, false);
  assert.equal(trays[0].destroyed, true);
  assert.equal(app.dockHidden, false);
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(writes[0].data).showInMenuBar, false);
});

test('the editor window cannot be navigated away or open pop-ups', async () => {
  const { windows } = await launch();
  const contents = windows[0].webContents;
  const navigate = url => {
    let prevented = false;
    contents.emit('will-navigate', { preventDefault() { prevented = true; } }, url);
    return prevented;
  };
  assert.equal(navigate('file:///Users/me/Downloads/dropped.html'), true, 'a dropped file must not replace the editor');
  assert.equal(navigate('https://example.com/'), true, 'a dropped link must not replace the editor');
  assert.equal(navigate(appEvent.senderFrame.url), false, 'reloading the editor itself stays allowed');
  assert.equal(contents.windowOpenHandler({ url: 'https://example.com/' }).action, 'deny');
});
test('IPC is only served to the editor page', async () => {
  const { ipcHandlers, writes } = await launch();
  assert.equal((await ipcHandlers.get('get-history')(appEvent)).length, 0);
  for (const url of ['file:///Users/me/Downloads/dropped.html', 'https://example.com/', undefined]) {
    const event = { senderFrame: url === undefined ? null : { url } };
    await assert.rejects(async () => ipcHandlers.get('get-history')(event));
    await assert.rejects(async () => ipcHandlers.get('save-to-history')(event, 'injected'));
  }
  assert.equal(writes.length, 0, 'rejected calls must not touch the history file');
});
