/* extension.js
 *
 * Quick Share GNOME Shell Extension
 * Connects Android Quick Share to GNOME Quick Settings
 * Uses self-contained standalone server on unusual port 45103
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { QuickMenuToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';

const PORT = 45103;
const SERVER_PATH = `${GLib.get_home_dir()}/.local/bin/quickshare-server`;
const DOWNLOADS_PATH = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) || `${GLib.get_home_dir()}/Downloads`;

const QuickShareToggle = GObject.registerClass(
class QuickShareToggle extends QuickMenuToggle {
    _init(indicator) {
        super._init({
            title: _('Quick Share'),
            subtitle: _('Checking...'),
            iconName: 'send-to-symbolic',
            toggleMode: true,
        });

        this._indicator = indicator;
        this._hostName = GLib.get_host_name();

        // Setup menu header
        this.menu.setHeader('send-to-symbolic', _('Quick Share'), this._hostName);

        // Status section
        this._statusSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._statusSection);

        this._statusItem = new PopupMenu.PopupMenuItem(_('Ready on port 45103'), {
            reactive: false,
            can_focus: false,
        });
        this._statusSection.addMenuItem(this._statusItem);

        this._transferItem = new PopupMenu.PopupMenuItem('', {
            reactive: false,
            can_focus: false,
        });
        this._transferItem.actor.hide();
        this._statusSection.addMenuItem(this._transferItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Action: Show QR Code & Web UI
        const openDashboardItem = new PopupMenu.PopupMenuItem(_('Show QR Code & Dashboard'));
        openDashboardItem.connect('activate', () => {
            try {
                Gio.AppInfo.launch_default_for_uri(`http://localhost:${PORT}`, null);
            } catch (e) {
                log(`QuickShare: Failed to open dashboard: ${e.message}`);
            }
        });
        this.menu.addMenuItem(openDashboardItem);

        // Action: Open Downloads
        const openDownloadsItem = new PopupMenu.PopupMenuItem(_('Open Received Files'));
        openDownloadsItem.connect('activate', () => {
            try {
                Gio.AppInfo.launch_default_for_uri(
                    GLib.filename_to_uri(DOWNLOADS_PATH, null),
                    null
                );
            } catch (e) {
                log(`QuickShare: Failed to open Downloads: ${e.message}`);
            }
        });
        this.menu.addMenuItem(openDownloadsItem);

        // Toggle action
        this.connect('clicked', () => {
            this._toggleService();
        });

        // Sync initially and start poller
        this._sync();
        this._startPoller();
    }

    _toggleService() {
        if (this.checked) {
            this.subtitle = _('Starting...');
            this._launchServer();
        } else {
            this.subtitle = _('Stopping...');
            this._stopServer();
        }
    }

    _launchServer() {
        try {
            Gio.Subprocess.new(['python3', SERVER_PATH], Gio.SubprocessFlags.NONE);
        } catch (e) {
            log(`QuickShare: Error launching server: ${e.message}`);
        }
    }

    _stopServer() {
        try {
            Gio.Subprocess.new(['pkill', '-f', 'quickshare-server'], Gio.SubprocessFlags.NONE);
        } catch (e) {
            log(`QuickShare: Error stopping server: ${e.message}`);
        }
    }

    _isServerRunning() {
        try {
            const [ok, out, err, status] = GLib.spawn_command_line_sync('pgrep -f quickshare-server');
            return ok && status === 0 && out.length > 0;
        } catch (e) {
            return false;
        }
    }

    _checkStatusJson() {
        try {
            const [ok, out] = GLib.spawn_command_line_sync(`curl -s --max-time 1 http://127.0.0.1:${PORT}/status`);
            if (!ok || !out) return null;
            const str = new TextDecoder('utf-8').decode(out).trim();
            if (!str) return null;
            return JSON.parse(str);
        } catch (e) {
            return null;
        }
    }

    _sync() {
        const isRunning = this._isServerRunning();
        this.checked = isRunning;
        this._indicator.updateVisible(isRunning);

        if (!isRunning) {
            this.subtitle = _('Off');
            this._statusItem.label.text = _('Server is stopped');
            this._transferItem.actor.hide();
            return;
        }

        const data = this._checkStatusJson();
        if (data && data.state === 'receiving') {
            this.subtitle = _(`Receiving ${data.progress}% (${data.speed})`);
            this._statusItem.label.text = _(`Receiving: ${data.file_name} (${data.speed})`);
            this._transferItem.label.text = `⚡ ${data.progress}%`;
            this._transferItem.actor.show();
        } else if (data && data.state === 'finished' && data.last_file) {
            this.subtitle = _('Ready (:45103)');
            this._statusItem.label.text = _(`Listening on unusual port ${PORT}`);
            this._transferItem.label.text = `✓ Received: ${data.last_file}`;
            this._transferItem.actor.show();
        } else {
            this.subtitle = _('Ready (:45103)');
            this._statusItem.label.text = _(`Listening on unusual port ${PORT}`);
            this._transferItem.actor.hide();
        }
    }

    _startPoller() {
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._sync();
            return GLib.SOURCE_CONTINUE;
        });
    }

    destroy() {
        if (this._timeout) {
            GLib.source_remove(this._timeout);
            this._timeout = null;
        }
        super.destroy();
    }
});

const QuickShareIndicator = GObject.registerClass(
class QuickShareIndicator extends SystemIndicator {
    _init() {
        super._init();

        this._icon = this._addIndicator();
        this._icon.icon_name = 'send-to-symbolic';
        this._icon.visible = false;

        this.quickToggle = new QuickShareToggle(this);
        this.quickSettingsItems.push(this.quickToggle);
    }

    updateVisible(visible) {
        if (this._icon) {
            this._icon.visible = visible;
        }
    }

    destroy() {
        if (this.quickToggle) {
            this.quickToggle.destroy();
            this.quickToggle = null;
        }
        super.destroy();
    }
});

export default class QuickShareExtension extends Extension {
    enable() {
        this._indicator = new QuickShareIndicator();
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
