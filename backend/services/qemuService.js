const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const runningVMs = {};
const baseImage = path.join(__dirname, '../images/base2.qcow2');
const overlayDir = path.join(__dirname, '../overlays');

if (!fs.existsSync(overlayDir)) fs.mkdirSync(overlayDir, { recursive: true });

exports.isRunning = (nodeName) => !!runningVMs[nodeName];

exports.createOverlay = async (nodeName) => {
    const overlayPath = path.join(overlayDir, `${nodeName}.qcow2`);
    const cmd = `qemu-img create -f qcow2 -o backing_fmt=qcow2 -b ${baseImage} ${overlayPath}`;
    await execPromise(cmd);
    return { name: nodeName, overlayPath };
};

exports.runVM = async (nodeName, overlayPath) => {
    if (!fs.existsSync(overlayPath)) throw new Error('Overlay not found');

    const nodeId = parseInt(nodeName.split('_')[1]);
    const hostSSHPort = 2220 + nodeId;
    const vncDisplay = nodeId;
    const vncHost = '0.0.0.0';

    const cmd = `qemu-system-x86_64 \
        -drive file=${overlayPath},format=qcow2 \
        -m 2048 \
        -net user,hostfwd=tcp::${hostSSHPort}-:22 \
        -net nic \
        -vnc ${vncHost}:${vncDisplay} \
        -daemonize`;

    await execPromise(cmd);

    const pid = parseInt(await execPromise(`pgrep -f "${overlayPath}"`));
    runningVMs[nodeName] = { pid };

    return { hostSSHPort, vncPort: 5900 + vncDisplay };
};

exports.stopVM = async (nodeName) => {
    const vm = runningVMs[nodeName];
    if (!vm) throw new Error('VM not running');
    await execPromise(`kill ${vm.pid}`);
    delete runningVMs[nodeName];
};

exports.wipeOverlay = async (nodeName, overlayPath) => {
    if (!fs.existsSync(overlayPath)) throw new Error('Overlay not found');
    await fs.promises.unlink(overlayPath);
    const cmd = `qemu-img create -f qcow2 -o backing_fmt=qcow2 -b ${baseImage} ${overlayPath}`;
    await execPromise(cmd);
};

function execPromise(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) reject(stderr || err.message);
            else resolve(stdout.trim());
        });
    });
}
