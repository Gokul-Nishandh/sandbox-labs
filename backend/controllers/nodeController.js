const fs = require('fs');
const path = require('path');
const qemuService = require('../services/qemuService');
const guacamoleService = require('../services/guacamoleService');
const inventoryPath = path.join(__dirname, '../inventory.json');

function readInventory() {
    if (!fs.existsSync(inventoryPath)) return [];
    return JSON.parse(fs.readFileSync(inventoryPath, 'utf8')).nodes || [];
}

function writeInventory(nodes) {
    fs.writeFileSync(inventoryPath, JSON.stringify({ nodes }, null, 2));
}

exports.listNodes = async (req, res) => {
    try {
        const nodes = readInventory();
        const result = await Promise.all(nodes.map(async (node) => {
            const running = qemuService.isRunning(node.name);
            const connectionId = running ? await guacamoleService.getConnectionId(node.name) : null;
            return {
                ...node,
                status: running ? 'running' : 'stopped',
                guacamoleUrl: connectionId ? `http://localhost:8080/guacamole/#/client/${connectionId}` : null
            };
        }));
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createNode = async (req, res) => {
    try {
        const nodes = readInventory();
        const nodeId = nodes.length + 1;
        const nodeName = `node_${nodeId}`;

        const overlay = await qemuService.createOverlay(nodeName);
        const node = { name: nodeName, image: overlay.overlayPath, ip: `192.168.56.${10 + nodeId}` };

        nodes.push(node);
        writeInventory(nodes);

        res.json(node);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.runNode = async (req, res) => {
    try {
        const nodeName = req.params.id;
        const node = readInventory().find(n => n.name === nodeName);
        if (!node) throw new Error('Node not found');

        const result = await qemuService.runVM(node.name, path.resolve(node.image));
        const connectionId = await guacamoleService.createConnection(node.name, node.ip, result.vncPort);

        res.json({
            success: true,
            hostSSHPort: result.hostSSHPort,
            vncPort: result.vncPort,
            guacamoleUrl: `http://localhost:8080/guacamole/#/client/${connectionId}`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.stopNode = async (req, res) => {
    try {
        const nodeName = req.params.id;
        if (!qemuService.isRunning(nodeName)) throw new Error('VM not running');
        await qemuService.stopVM(nodeName);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.wipeNode = async (req, res) => {
    try {
        const nodeName = req.params.id;
        const node = readInventory().find(n => n.name === nodeName);
        if (!node) throw new Error('Node not found');
        await qemuService.wipeOverlay(node.name, path.resolve(node.image));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.wipeAllNodes = async (req, res) => {
    try {
        const nodes = readInventory();
        for (const node of nodes) {
            if (qemuService.isRunning(node.name)) await qemuService.stopVM(node.name);
            await qemuService.wipeOverlay(node.name, path.resolve(node.image));
        }
        res.json({ success: true, message: 'All nodes stopped and wiped' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
