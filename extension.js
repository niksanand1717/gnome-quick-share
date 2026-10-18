/* extension.js
 *
 * Quick Share GNOME Shell Extension
 * Connects Android Quick Share to GNOME Quick Settings
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

const APP_PATH = `${GLib.get_home_dir()}/.local/bin/r-quick-share.AppImage`;
const LOG_PATH = `${GLib.get_home_dir()}/.local/share/dev.mandre.rquickshare/logs/RQuickShare.log`;
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

        // Status section in menu
        this._statusSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._statusSection);

        this._statusItem = new PopupMenu.PopupMenuItem(_('Ready for transfers'), {
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

        // Action: Open App Window
        const openAppItem = new PopupMenu.PopupMenuItem(_('Open Quick Share App'));
        openAppItem.connect('activate', () => {
            this._launchApp();
        });
        this.menu.addMenuItem(openAppItem);

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
            this._launchApp();
        } else {
            this.subtitle = _('Stopping...');
            this._stopApp();
        }
    }

    _launchApp() {
        try {
            Gio.Subprocess.new([APP_PATH], Gio.SubprocessFlags.NONE);
        } catch (e) {
            log(`QuickShare: Error launching App: ${e.message}`);
        }
    }

    _stopApp() {
        try {
            Gio.Subprocess.new(['pkill', '-f', 'r-quick-share'], Gio.SubprocessFlags.NONE);
        } catch (e) {
            log(`QuickShare: Error stopping App: ${e.message}`);
        }
    }

    _isAppRunning() {
        try {
            const [ok, out, err, status] = GLib.spawn_command_line_sync('pgrep -f r-quick-share');
            return ok && status === 0 && out.length > 0;
        } catch (e) {
            return false;
        }
    }

    _checkLogStatus() {
        const file = Gio.File.new_for_path(LOG_PATH);
        if (!file.query_exists(null)) {
            return { state: 'Idle', device: '', file: '', progress: 0 };
        }

        try {
            const [ok, out] = GLib.spawn_command_line_sync(`tail -n 25 "${LOG_PATH}"`);
            if (!ok || !out) return { state: 'Idle', device: '', file: '', progress: 0 };
            const content = new TextDecoder('utf-8').decode(out);
            const lines = content.trim().split('\n');

            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                if (line.includes('state: Some(ReceivingFiles)')) {
                    let device = '';
                    let fileName = '';
                    let progress = 0;
                    const nameMatch = line.match(/name:\s*"([^"]+)"/);
                    if (nameMatch) device = nameMatch[1];
                    const fileMatch = line.match(/files:\s*Some\(\["([^"]+)"/);
                    if (fileMatch) fileName = fileMatch[1];
                    const totalMatch = line.match(/total_bytes:\s*(\d+)/);
                    const ackMatch = line.match(/ack_bytes:\s*(\d+)/);
                    if (totalMatch && ackMatch) {
                        const total = parseInt(totalMatch[1]);
                        const ack = parseInt(ackMatch[1]);
                        if (total > 0) progress = Math.min(100, Math.round((ack / total) * 100));
                    }
                    return { state: 'Receiving', device, file: fileName, progress };
                } else if (line.includes('state: Some(Finished)') || line.includes('Transfer finished')) {
                    let device = '';
                    let fileName = '';
                    const nameMatch = line.match(/name:\s*"([^"]+)"/);
                    if (nameMatch) device = nameMatch[1];
                    const fileMatch = line.match(/files:\s*Some\(\["([^"]+)"/);
                    if (fileMatch) fileName = fileMatch[1];
                    return { state: 'Finished', device, file: fileName, progress: 100 };
                }
            }
        } catch (e) {
            // ignore
        }
        return { state: 'Idle', device: '', file: '', progress: 0 };
    }

    _sync() {
        const isRunning = this._isAppRunning();
        this.checked = isRunning;
        this._indicator.updateVisible(isRunning);

        if (!isRunning) {
            this.subtitle = _('Off');
            this._statusItem.label.text = _('Quick Share is disabled');
            this._transferItem.actor.hide();
            return;
        }

        const status = this._checkLogStatus();
        if (status.state === 'Receiving') {
            const dev = status.device ? ` from ${status.device}` : '';
            this.subtitle = _(`Receiving ${status.progress}%`);
            this._statusItem.label.text = _(`Receiving${dev}... (${status.progress}%)`);
            if (status.file) {
                const shortFile = status.file.length > 28 ? status.file.substring(0, 25) + '...' : status.file;
                this._transferItem.label.text = `📄 ${shortFile}`;
                this._transferItem.actor.show();
            }
        } else if (status.state === 'Finished') {
            this.subtitle = _('Visible');
            this._statusItem.label.text = status.device ? _(`Connected: ${status.device}`) : _('Ready for transfers');
            if (status.file) {
                const shortFile = status.file.length > 28 ? status.file.substring(0, 25) + '...' : status.file;
                this._transferItem.label.text = `✓ ${shortFile}`;
                this._transferItem.actor.show();
            }
        } else {
            this.subtitle = _('Visible');
            this._statusItem.label.text = _('Ready for transfers (Visible to all)');
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
