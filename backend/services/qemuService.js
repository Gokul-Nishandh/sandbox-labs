const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const runningVMs = {}; // Track running VMs
const baseImage = path.join(__dirname, '../images/base2.qcow2');
const overlayDir = path.join(__dirname, '../overlays');

// Ensure overlay directory exists
if (!fs.existsSync(overlayDir)) fs.mkdirSync(overlayDir, { recursive: true });

exports.isRunning = (nodeName) => !!runningVMs[nodeName];

exports.runVM = (nodeName, overlayPath) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(overlayPath)) return reject(new Error('Overlay not found'));

        const nodeId = parseInt(nodeName.split('_')[1]);
        const hostSSHPort = 2220 + nodeId;
        const vncDisplay = nodeId;
        const vncHost = '127.0.0.1';

        const cmd = `qemu-system-x86_64 \
            -drive file=${overlayPath},format=qcow2 \
            -m 2048 \
            -net user,hostfwd=tcp::${hostSSHPort}-:22 \
            -net nic \
            -vnc ${vncHost}:${vncDisplay} \
            -daemonize`;

        exec(cmd, (err) => {
            if (err) return reject(err);

            // Get PID of the last started QEMU process
            exec(`pgrep -f "${overlayPath}"`, (err2, stdout2) => {
                if (err2) return reject(err2);
                const pid = parseInt(stdout2.split('\n')[0]);
                runningVMs[nodeName] = { pid };
                resolve({ hostSSHPort, vncPort: 5900 + vncDisplay });
            });
        });
    });
};

exports.stopVM = (nodeName) => {
    return new Promise((resolve, reject) => {
        const vm = runningVMs[nodeName];
        if (!vm || !vm.pid) return reject(new Error('VM not running'));

        exec(`kill ${vm.pid}`, (err) => {
            if (err) return reject(err);
            delete runningVMs[nodeName];
            resolve();
        });
    });
};

exports.wipeOverlay = (nodeName, overlayPath) => {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(overlayPath)) return reject(new Error('Overlay not found'));

        fs.unlink(overlayPath, (err) => {
            if (err) return reject(err);

            const cmd = `qemu-img create -f qcow2 -o backing_fmt=qcow2 -b ${baseImage} ${overlayPath}`;
            exec(cmd, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
};

exports.createOverlay = (nodeName) => {
    return new Promise((resolve, reject) => {
        const overlayPath = path.join(overlayDir, `${nodeName}.qcow2`);
        const cmd = `qemu-img create -f qcow2 -o backing_fmt=qcow2 -b ${baseImage} ${overlayPath}`;
        exec(cmd, (err) => {
            if (err) return reject(err);
            resolve({ name: nodeName, overlayPath });
        });
    });
};
