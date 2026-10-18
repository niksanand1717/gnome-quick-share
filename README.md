# Quick Share for GNOME Shell

A native **GNOME Quick Settings Extension** and standalone Quick Share daemon for seamless file transfers between Android and Ubuntu.

Zero web servers. Zero open ports. 100% native desktop integration.

---

## Features

- **In-UI Progress Bar**: Real-time progress bar right inside the GNOME Quick Settings menu showing file name, percentage, and transfer speed (MB/s).
- **Clean Desktop Notifications**: Exactly 1 low-priority notification when the transfer begins and 1 completion notification when finished. Zero popup spam during chunk streaming.
- **Server-Free Architecture**: No HTTP server, no open web ports, no browser required. Operates completely in-memory via user runtime directory (`tmpfs`).
- **Direct Protocol Engine**: Native Rust daemon built directly from `rqs_lib` source handling Google Quick Share / Nearby Share protocol (Bluetooth Low Energy + mDNS + peer-to-peer TCP).
- **Auto-Save**: Incoming files land directly in `~/Downloads` without prompting or delays.

---

## Quick Start

### 1. Run the Native Daemon
```bash
~/.local/bin/quickshare-daemon
```

### 2. Enable GNOME Shell Extension
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
