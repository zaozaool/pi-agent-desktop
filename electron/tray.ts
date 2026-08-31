import { app, Menu, Tray, BrowserWindow, nativeImage } from "electron";
import path from "path";
import { setQuitting } from "./main";
import { getAppIconPath } from "./app-icon";

const FALLBACK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFElEQVQ4y2N" +
  "kwAT/GYYBYwYDAKLuAf8LSXNHAAAAABJRU5ErkJggg==";

function fallbackIcon(): Electron.NativeImage {
  // minimal 16x16 transparent PNG
  return nativeImage.createFromBuffer(Buffer.from(FALLBACK_PNG_BASE64, "base64"));
}

function loadMacTemplateIcon(): Electron.NativeImage | null {
  // macOS menu bar: black template image so the glyph adapts to light/dark
  // menu bars automatically. @2x representation covers retina displays.
  const basePath = path.join(app.getAppPath(), "build", "tray-icon-mac.png");
  const retinaPath = path.join(app.getAppPath(), "build", "tray-icon-mac@2x.png");
  const icon = nativeImage.createFromPath(basePath);
  if (icon.isEmpty()) return null;
  const retina = nativeImage.createFromPath(retinaPath);
  if (!retina.isEmpty()) {
    icon.addRepresentation({ scaleFactor: 2, buffer: retina.toPNG(), width: 16, height: 16 });
  }
  icon.setTemplateImage(true);
  return icon;
}

function loadWindowsIcon(): Electron.NativeImage {
  // Packaged app icon (.ico on Windows, .icns as macOS fallback); SVG is
  // not reliably supported by the Win10 tray.
  const iconPath = getAppIconPath(app.getAppPath());
  try {
    const icon = nativeImage.createFromPath(iconPath);
    return icon.isEmpty() ? fallbackIcon() : icon;
  } catch {
    return fallbackIcon();
  }
}

export function createTray(mainWindow: BrowserWindow): Tray {
  const icon =
    process.platform === "darwin" ? (loadMacTemplateIcon() ?? loadWindowsIcon()) : loadWindowsIcon();

  const tray = new Tray(icon);
  tray.setToolTip("Pi Agent Desktop");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示窗口",
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        setQuitting(true);
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}
