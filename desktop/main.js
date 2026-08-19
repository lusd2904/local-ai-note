const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');

let mainWindow = null;

// 🔒 1. 单实例互斥锁 (Single Instance Lock)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 如果已经有实例在运行，直接退出当前新实例
  app.quit();
} else {
  // 当用户试图打开第二个实例时，自动唤醒并置顶第一个实例的主窗口
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  const NOTE_URL = 'http://localhost:3000';

  function checkServerReady(callback) {
    http.get(NOTE_URL, (res) => {
      callback(res.statusCode === 200);
    }).on('error', () => {
      callback(false);
    });
  }

  function ensureDockerRunning(callback) {
    checkServerReady((isReady) => {
      if (isReady) return callback();
      const projectDir = path.resolve(__dirname, '..');
      exec('docker compose up -d', { cwd: projectDir }, () => {
        let retries = 0;
        const interval = setInterval(() => {
          retries++;
          checkServerReady((ready) => {
            if (ready || retries > 30) {
              clearInterval(interval);
              callback();
            }
          });
        }, 1000);
      });
    });
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 900,
      minHeight: 600,
      title: '本地 AI 智能笔记',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 14 },
      backgroundColor: '#F6F6F6',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        spellcheck: true
      }
    });

    ensureDockerRunning(() => {
      mainWindow.loadURL(NOTE_URL);
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  function createMenu() {
    const isMac = process.platform === 'darwin';
    const template = [
      ...(isMac ? [{
        label: app.name,
        submenu: [
          { role: 'about', label: '关于 本地 AI 智能笔记' },
          { type: 'separator' },
          { role: 'hide', label: '隐藏' },
          { role: 'hideOthers', label: '隐藏其他' },
          { role: 'unhide', label: '显示全部' },
          { type: 'separator' },
          { role: 'quit', label: '退出' }
        ]
      }] : []),
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' },
          { role: 'selectAll', label: '全选' }
        ]
      },
      {
        label: '视图',
        submenu: [
          { role: 'reload', label: '重新加载' },
          { role: 'togglefullscreen', label: '切换全屏' }
        ]
      }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  app.whenReady().then(() => {
    createMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
