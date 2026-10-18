import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to mimic isPidAlive from extension.js
function isPidAlive(pid) {
    if (!pid || pid <= 0) return false;
    try {
        const procDir = `/proc/${pid}`;
        if (!fs.existsSync(procDir)) return false;
        const cmdFile = path.join(procDir, 'cmdline');
        if (!fs.existsSync(cmdFile)) return false;
        const cmd = fs.readFileSync(cmdFile, 'utf-8');
        return cmd.length > 0;
    } catch {
        return false;
    }
}

// Helper to mimic _updateFillBar math from extension.js
function calculateFillWidth(percent, totalWidth = 240) {
    const clampedPercent = Math.min(100, Math.max(0, percent || 0));
    return Math.max(4, Math.round((clampedPercent / 100) * totalWidth));
}

test('metadata.json schema and compatibility', () => {
    const metaPath = path.join(rootDir, 'metadata.json');
    assert.ok(fs.existsSync(metaPath), 'metadata.json must exist');

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    assert.equal(meta.uuid, 'quickshare@niksanand1717.github.com');
    assert.equal(meta.name, 'Quick Share');
    assert.ok(Array.isArray(meta['shell-version']), 'shell-version must be an array');
    assert.ok(meta['shell-version'].includes('45'), 'must support GNOME 45');
    assert.ok(meta['shell-version'].includes('46'), 'must support GNOME 46');
    assert.ok(meta['shell-version'].includes('47'), 'must support GNOME 47');
});

test('quickshare.json schema and contract validation', () => {
    const validPayload = JSON.stringify({
        state: 'receiving',
        device: "Nikhil's Galaxy A54 5G",
        file: 'test_movie.mp4',
        total_bytes: 104857600,
        received_bytes: 52428800,
        progress: 50,
        speed: '15.2 MB/s',
        last_file: '',
        pid: process.pid,
    });

    const parsed = JSON.parse(validPayload);
    assert.equal(parsed.state, 'receiving');
    assert.equal(parsed.progress, 50);
    assert.equal(parsed.pid, process.pid);
    assert.ok(parsed.file.endsWith('.mp4'));

    // Malformed JSON recovery
    assert.throws(() => JSON.parse('{ broken json... '), /SyntaxError/);
});

test('process liveness verification via /proc VFS', () => {
    // Current test process must be alive
    assert.equal(isPidAlive(process.pid), true, 'Current running process must be reported alive');

    // Invalid PIDs
    assert.equal(isPidAlive(-1), false, 'PID -1 must be dead');
    assert.equal(isPidAlive(0), false, 'PID 0 must be dead');
    assert.equal(isPidAlive(9999999), false, 'Non-existent high PID must be reported dead');
});

test('responsive progress bar fill calculation and clamping', () => {
    // Standard 240px width
    assert.equal(calculateFillWidth(0, 240), 4, '0% should return minimum visible track fill of 4px');
    assert.equal(calculateFillWidth(50, 240), 120, '50% of 240px should return 120px');
    assert.equal(calculateFillWidth(100, 240), 240, '100% of 240px should return 240px');

    // Dynamic width on HiDPI 360px width
    assert.equal(calculateFillWidth(50, 360), 180, '50% of 360px should return 180px');
    assert.equal(calculateFillWidth(100, 360), 360, '100% of 360px should return 360px');

    // Edge cases / Clamping
    assert.equal(calculateFillWidth(-10, 240), 4, 'Negative percent clamped to min width');
    assert.equal(calculateFillWidth(150, 240), 240, 'Over 100% clamped to total width');
    assert.equal(calculateFillWidth(null, 240), 4, 'Null clamped to min width');
});
