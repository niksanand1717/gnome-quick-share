# Quick Share for GNOME Shell

A native **GNOME Quick Settings Extension** and standalone Rust daemon enabling seamless, high-speed Wi-Fi file transfers from Android devices to Ubuntu / Linux via Google's native **Quick Share / Nearby Share** protocol.

Zero web servers. Zero open ports. 100% native desktop and system integration.

---

## Architecture Overview

```text
┌─────────────────────────┐          ┌────────────────────────────────────────┐
│  Android Quick Share    │          │            Ubuntu / Linux              │
│  (Samsung / Pixel / etc)│          │                                        │
└────────────┬────────────┘          │  ┌──────────────────────────────────┐  │
             │ BLE Beacon (Discovery)│  │   quickshare-daemon (Rust)       │  │
             ├───────────────────────┼─>│   - BLE Advertiser (hci0)        │  │
             │ mDNS / TCP (P2P Wi-Fi)│  │   - mDNS Service Discovery       │  │
             ├───────────────────────┼─>│   - UKEY2 / Protobuf P2P Socket  │  │
             │ File Stream           │  │   - Auto-saves to ~/Downloads    │  │
             │                       │  └───────────────┬──────────────────┘  │
             │                       │                  │ inotify updates     │
             │                       │                  v (tmpfs zero-disk)   │
             │                       │      /run/user/$UID/quickshare.json    │
             │                       │                  │                     │
             │                       │                  v Gio.FileMonitor     │
             │                       │  ┌──────────────────────────────────┐  │
             │                       │  │ GNOME Shell Extension (ESM 45-47)│  │
             │                       │  │   - Quick Settings Toggle        │  │
             │                       │  │   - Real-time Progress Bar UI    │  │
             │                       │  │   - Zero Main-Thread Polling     │  │
             │                       │  └──────────────────────────────────┘  │
             └───────────────────────┴────────────────────────────────────────┘
```

---

## Key Features & Engineering Highlights

- **Event-Driven Architecture (Zero Main-Thread Polling)**:
  Uses GLib's `Gio.FileMonitor` (`inotify`) to listen for status changes in `/run/user/$UID/quickshare.json`. Consumes **zero CPU wakeups** when idle and eliminates synchronous shell spawning (`spawn_command_line_sync`) on the GNOME compositor loop.
- **In-UI Progress Bar Widget**:
  Real-time progress percentage, filename, and throughput speed (MB/s) dynamically rendered directly in the GNOME Quick Settings menu, with responsive Clutter allocation scaling across all HiDPI display factors.
- **Clean Notification Policy**:
  - **Start**: Exactly **1 low-priority notification** when an incoming transfer begins (`Receiving from <Device>: <File>`).
  - **Streaming**: **0 intermediate popups** during chunk streaming to prevent desktop lockups and notification spam during multi-gigabyte transfers.
  - **Finish**: Exactly **1 normal notification** upon successful completion (`✓ Received: <File> (Saved to Downloads)`).
- **Graceful Lifecycle & Signal Handling**:
  The Rust daemon traps both `SIGINT` and `SIGTERM` (signal 15), unlinking runtime state and tearing down Bluetooth LE advertisements and TCP sockets cleanly.
- **Security & Sanitization**:
  Peer metadata filenames are stripped of path traversal characters (`..`, `/`, `\`) to ensure all payloads land safely in `~/Downloads`.
- **Server-Free & No Open Web Ports**:
  Does not open any HTTP or browser endpoints; communication is purely native P2P over Wi-Fi and Bluetooth.

---

## Quick Start

### 1. Run the Daemon
```bash
# Bundled executable or user binary
~/.local/bin/quickshare-daemon
```

### 2. Enable the Extension
```bash
gnome-extensions enable quickshare@niksanand1717.github.com
```

### 3. Send Files from Android
1. Open any photo, video, or document on your Android device.
2. Tap **Share** -> **Quick Share**.
3. Select your computer name (e.g. `niks-IdeaPad-Gaming-3-15IMH05`).
4. Transfer begins immediately; track live progress in your GNOME Quick Settings panel!

---

## Building from Source

### Prerequisites
- Rust toolchain (`cargo`, `rustc` >= 1.80)
- Protocol Buffers compiler (`protobuf-compiler` or `protoc`)
- BlueZ and DBus development libraries:
  ```bash
  sudo apt install -y libdbus-1-dev libssl-dev protobuf-compiler
  ```

### Build Daemon
```bash
git clone https://github.com/niksanand1717/gnome-quick-share.git
cd gnome-quick-share
cargo build --release --manifest-path daemon-src/Cargo.toml  # or compile standalone daemon
cp target/release/quickshare-daemon ~/.local/bin/
```

---

## Packaging for `extensions.gnome.org` (EGO)

```bash
./pack.sh
```
This builds `quickshare@niksanand1717.github.com.shell-extension.zip`, ready for submission to [extensions.gnome.org/upload/](https://extensions.gnome.org/upload/).

---

## License

GPL-2.0-or-later
