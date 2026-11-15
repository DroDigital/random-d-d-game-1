// Oathguard desktop shell (Electron). Loads the same self-contained build
// that runs in a browser (play/index.html), in a native window.
const { app, BrowserWindow, globalShortcut, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// The game was first released as "Ashen Oath". Keep using that profile folder
// when it exists so progress, settings and unlocks survive the rename.
try {
  const legacy = path.join(app.getPath('appData'), 'Ashen Oath');
  if (fs.existsSync(legacy)) app.setPath('userData', legacy);
} catch (e) { /* first launch: use the default folder */ }

// Keep the PSX look crisp and gamepads responsive.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#000000',
    title: 'Oathguard',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'play', 'index.html'));
  win.once('ready-to-show', () => { win.show(); if ((process.env.OATHGUARD_FULLSCREEN || process.env.ASHEN_FULLSCREEN) === '1') win.setFullScreen(true); });
  // external links (none in-game today) open in the system browser, never in the game window
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
    if (input.key === 'F12' && !app.isPackaged) win.webContents.toggleDevTools();
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => globalShortcut.unregisterAll());
