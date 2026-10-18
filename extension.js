/* extension.js
 *
 * Quick Share GNOME Shell Extension
 * Direct Quick Share integration with in-UI Progress Bar and Desktop Notifications
 * Zero external web server. Pure native desktop integration.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { QuickMenuToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';

const DAEMON_PATH = `${GLib.get_home_dir()}/.local/bin/quickshare-daemon`;
const DOWNLOADS_PATH = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) || `${GLib.get_home_dir()}/Downloads`;
const STATUS_PATH = `${GLib.get_user_runtime_dir()}/quickshare.json`;

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

        // Status Item (Ready state)
        this._statusSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._statusSection);

        this._statusItem = new PopupMenu.PopupMenuItem(_('Ready for transfers (Visible to all)'), {
            reactive: false,
            can_focus: false,
        });
        this._statusSection.addMenuItem(this._statusItem);

        // --- In-UI Progress Bar Widget ---
        this._progressBox = new St.BoxLayout({
            vertical: true,
            style_class: 'quick-share-progress-container',
            x_expand: true,
        });

        // Line 1: File name and %
        const headerBox = new St.BoxLayout({ x_expand: true });
        this._fileNameLabel = new St.Label({
            text: _('File'),
            style_class: 'quick-share-title-text',
            x_expand: true,
        });
        this._fileNameLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;

        this._percentLabel = new St.Label({
            text: '0%',
            style_class: 'quick-share-title-text',
            x_align: Clutter.ActorAlign.END,
        });
        headerBox.add_child(this._fileNameLabel);
        headerBox.add_child(this._percentLabel);
        this._progressBox.add_child(headerBox);

        // Line 2: Progress track and fill bar
        this._barBg = new St.Widget({
            style_class: 'quick-share-progress-bg',
            x_expand: true,
        });
        this._barFill = new St.Widget({
            style_class: 'quick-share-progress-fill',
            width: 0,
        });
        this._barBg.add_child(this._barFill);
        this._progressBox.add_child(this._barBg);

        // Line 3: Transfer speed and size
        this._detailsLabel = new St.Label({
            text: '',
            style_class: 'quick-share-sub-text',
        });
        this._progressBox.add_child(this._detailsLabel);

        this._progressMenuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        this._progressMenuItem.add_child(this._progressBox);
        this._progressMenuItem.actor.hide();
        this.menu.addMenuItem(this._progressMenuItem);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Action: Open Received Files
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
            this._launchDaemon();
        } else {
            this.subtitle = _('Stopping...');
            this._stopDaemon();
        }
    }

    _launchDaemon() {
        try {
            Gio.Subprocess.new([DAEMON_PATH], Gio.SubprocessFlags.NONE);
        } catch (e) {
            log(`QuickShare: Error launching daemon: ${e.message}`);
        }
    }

    _stopDaemon() {
        try {
            Gio.Subprocess.new(['pkill', '-f', 'quickshare-daemon'], Gio.SubprocessFlags.NONE);
        } catch (e) {
            log(`QuickShare: Error stopping daemon: ${e.message}`);
        }
    }

    _isDaemonRunning() {
        try {
            const [ok, out, err, status] = GLib.spawn_command_line_sync('pgrep -f quickshare-daemon');
            return ok && status === 0 && out.length > 0;
        } catch (e) {
            return false;
        }
    }

    _readStatusFile() {
        try {
            const file = Gio.File.new_for_path(STATUS_PATH);
            if (!file.query_exists(null)) return null;
            const [ok, bytes] = file.load_contents(null);
            if (!ok || !bytes) return null;
            const str = new TextDecoder('utf-8').decode(bytes).trim();
            if (!str) return null;
            return JSON.parse(str);
        } catch (e) {
            return null;
        }
    }

    _sync() {
        const isRunning = this._isDaemonRunning();
        this.checked = isRunning;
        this._indicator.updateVisible(isRunning);

        if (!isRunning) {
            this.subtitle = _('Off');
            this._statusItem.label.text = _('Quick Share is turned off');
            this._progressMenuItem.actor.hide();
            return;
        }

        const data = this._readStatusFile();
        if (data && data.state === 'receiving') {
            const p = data.progress || 0;
            const speed = data.speed ? ` • ${data.speed}` : '';
            this.subtitle = _(`Receiving ${p}%${speed}`);

            this._statusItem.label.text = data.device ? _(`Receiving from ${data.device}`) : _('Receiving...');
            this._fileNameLabel.text = data.file || _('File');
            this._percentLabel.text = `${p}%`;
            this._detailsLabel.text = data.speed ? `${data.speed}` : '';

            // Update in-UI progress bar width
            const totalWidth = this._barBg.get_width() || 240;
            const fillWidth = Math.max(4, Math.round((p / 100) * totalWidth));
            this._barFill.set_width(fillWidth);

            this._progressMenuItem.actor.show();
        } else if (data && data.state === 'finished' && data.last_file) {
            this.subtitle = _('Visible');
            this._statusItem.label.text = _('Ready for transfers (Visible to all)');
            this._fileNameLabel.text = `✓ ${data.last_file}`;
            this._percentLabel.text = '100%';
            this._detailsLabel.text = _('Saved to Downloads');
            const totalWidth = this._barBg.get_width() || 240;
            this._barFill.set_width(totalWidth);
            this._progressMenuItem.actor.show();
        } else {
            this.subtitle = _('Visible');
            this._statusItem.label.text = _('Ready for transfers (Visible to all)');
            this._progressMenuItem.actor.hide();
        }
    }

    _startPoller() {
        this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
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
