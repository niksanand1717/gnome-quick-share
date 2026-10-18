# Quick Share for GNOME Shell

Seamless Android **Quick Share** (formerly Nearby Share) integration right inside the **GNOME Shell Quick Settings** panel.

Transfer files, photos, and videos between your Android device and your Ubuntu / GNOME desktop with a single tap.

---

## Features

- **Quick Settings Toggle**: Toggle Quick Share visibility on or off directly from the GNOME status menu.
- **Top Panel Status Indicator**: Shows an indicator icon in the top bar whenever Quick Share is active.
- **Live Transfer Progress**: Displays real-time file transfer progress (`Receiving (45%)`) and device name.
- **One-Click Folder Access**: Shortcut in the Quick Settings dropdown to open your received files folder (`~/Downloads`).
- **GNOME 45 & 46+ Support**: Built with modern GJS and ES Modules (ESM).

---

## Requirements

- **GNOME Shell**: 45, 46, or 47 (Ubuntu 23.10, 24.04 LTS, 24.10+)
- **Backend Service**: [RQuickShare](https://github.com/Martichou/rquickshare) (installed at `~/.local/bin/r-quick-share.AppImage`)

---

## Installation

### Local Installation (Development)

1. Clone or copy this repository to your GNOME extensions directory:
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/quickshare@niksanand1717.github.com
   cp -r * ~/.local/share/gnome-shell/extensions/quickshare@niksanand1717.github.com/
   ```

2. Reload GNOME Shell:
   - On **X11**: Press `Alt` + `F2`, type `r`, and press `Enter`.
   - On **Wayland**: Log out and log back in.

3. Enable the extension:
   ```bash
   gnome-extensions enable quickshare@niksanand1717.github.com
   ```

---

## Submitting to GNOME Extensions (`extensions.gnome.org`)

1. Build the extension package:
   ```bash
   ./pack.sh
   ```
   This generates `quickshare@niksanand1717.github.com.shell-extension.zip`.

2. Go to [https://extensions.gnome.org/upload/](https://extensions.gnome.org/upload/).
3. Upload the `.shell-extension.zip` bundle and submit for review.

---

## License

GNU General Public License v2.0 or later (GPL-2.0-or-later).
