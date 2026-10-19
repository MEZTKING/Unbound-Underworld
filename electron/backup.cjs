// Save backups in a file the player picks (src/net/backupfile.ts). The pickers
// open in the Google Drive folder when Google Drive for desktop is installed,
// so the backup reaches Google Drive with no sign-in. The game may only read
// and write files the player picked here; that list is kept in user data.
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const listFile = () => path.join(app.getPath('userData'), 'backup-files.json');

function picked() {
  try {
    const list = JSON.parse(fs.readFileSync(listFile(), 'utf8'));
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

function allow(file) {
  const list = picked();
  if (!list.includes(file)) {
    list.push(file);
    try {
      fs.writeFileSync(listFile(), JSON.stringify(list.slice(-16)));
    } catch {
      /* allowed until the app closes */
    }
    session.add(file);
  }
}

const session = new Set();
const allowed = (file) => typeof file === 'string' && (session.has(file) || picked().includes(file));

/** "My Drive" of Google Drive for desktop, if it's on this computer. */
function driveFolder() {
  const tries = [];
  if (process.platform === 'win32') {
    for (const letter of 'GHIJKLMNOPQRSTUVWXYZDEF') tries.push(`${letter}:\\My Drive`);
  }
  if (process.platform === 'darwin') {
    const cloud = path.join(os.homedir(), 'Library', 'CloudStorage');
    try {
      for (const d of fs.readdirSync(cloud)) if (d.startsWith('GoogleDrive')) tries.push(path.join(cloud, d, 'My Drive'));
    } catch {
      /* no cloud storage */
    }
  }
  tries.push(path.join(os.homedir(), 'Google Drive', 'My Drive'), path.join(os.homedir(), 'Google Drive'), path.join(os.homedir(), 'My Drive'));
  for (const t of tries) {
    try {
      if (fs.statSync(t).isDirectory()) return t;
    } catch {
      /* not here */
    }
  }
  return '';
}

const win = (event) => BrowserWindow.fromWebContents(event.sender) ?? undefined;
const filters = [{ name: 'Unbound Underworld save', extensions: ['json'] }];

function registerBackup() {
  ipcMain.handle('backup:drive', () => driveFolder());
  ipcMain.handle('backup:create', async (event, name) => {
    const base = driveFolder() || app.getPath('documents');
    const r = await dialog.showSaveDialog(win(event), {
      title: 'Back up your save',
      defaultPath: path.join(base, path.basename(String(name || 'unbound-underworld-save.json'))),
      filters,
    });
    if (r.canceled || !r.filePath) return null;
    allow(r.filePath);
    return { id: r.filePath, name: path.basename(r.filePath) };
  });
  ipcMain.handle('backup:open', async (event) => {
    const r = await dialog.showOpenDialog(win(event), { title: 'Choose a backup file', defaultPath: driveFolder() || app.getPath('documents'), filters, properties: ['openFile'] });
    const file = r.filePaths?.[0];
    if (r.canceled || !file) return null;
    allow(file);
    return { id: file, name: path.basename(file) };
  });
  ipcMain.handle('backup:read', (event, file) => {
    if (!allowed(file)) throw new Error('Choose the backup file again.');
    return fs.promises.readFile(file, 'utf8');
  });
  ipcMain.handle('backup:write', async (event, file, text) => {
    if (!allowed(file)) throw new Error('Choose the backup file again.');
    await fs.promises.writeFile(file, String(text), 'utf8');
  });
}

module.exports = { registerBackup };
