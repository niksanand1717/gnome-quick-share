# Quick Share for GNOME Shell & Android

A lightweight, standalone file-sharing server running on an unusual port (`45103`) paired with a native **GNOME Quick Settings Extension**.

Allows instant, full-speed Wi-Fi file transfers directly between any Android phone and Ubuntu without relying on heavy external AppImages or third-party binaries.

---

## Architecture

- **Standalone Server (`quickshare-server.py`)**:
  - Pure Python 3 standard library with zero external dependencies.
  - Listens on unusual port **`45103`**.
  - **Dual-mode interface**:
    - **Desktop**: Displays an embedded offline QR code with direct IP & `.local` mDNS links.
    - **Mobile**: Responsive, dark-mode file uploader supporting multi-file, 4K videos, and large file streaming directly to `~/Downloads`.
  - Live transfer tracking (`/status` endpoint) with real-time transfer speed (MB/s) and desktop notifications (`notify-send`).
- **GNOME Shell Extension (`quickshare@niksanand1717.github.com`)**:
  - Plugs natively into GNOME 45 & 46+ Quick Settings (top-right menu).
  - Toggles the server on/off with one click.
  - Live status indicator with upload progress (`Receiving 85% (32 MB/s)`).
  - One-click access to QR code dashboard and received files.

---

## Quick Start

### 1. Run Server Manually
```bash
python3 quickshare-server.py
```
Or use the installed command:
```bash
quickshare-server
```

Open `http://localhost:45103` in your browser to view the pairing QR code.

### 2. Install & Enable GNOME Shell Extension
```bash
mkdir -p ~/.local/share/gnome-shell/extensions/quickshare@niksanand1717.github.com
cp metadata.json extension.js stylesheet.css ~/.local/share/gnome-shell/extensions/quickshare@niksanand1717.github.com/
```
Reload GNOME Shell (`Alt` + `F2`, type `r`, press `Enter`), then enable:
```bash
gnome-extensions enable quickshare@niksanand1717.github.com
```

---

## Packaging for GNOME Extensions (`extensions.gnome.org`)

```bash
./pack.sh
```
Upload `quickshare@niksanand1717.github.com.shell-extension.zip` directly to [extensions.gnome.org/upload/](https://extensions.gnome.org/upload/).

---

## License

GPL-2.0-or-later
