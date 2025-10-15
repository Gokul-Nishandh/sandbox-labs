const fs = require('fs');
const path = require('path');
const qemuService = require('../services/qemuService');

const inventoryPath = path.join(__dirname, '../inventory.json');

// Utility: Read inventory
function readInventory() {
    if (!fs.existsSync(inventoryPath)) return [];
    const data = fs.readFileSync(inventoryPath, 'utf8');
    return JSON.parse(data).nodes || [];
}

// Utility: Write inventory
function writeInventory(nodes) {
    fs.writeFileSync(inventoryPath, JSON.stringify({ nodes }, null, 2));
}

// List nodes with status
exports.listNodes = (req, res) => {
    const nodes = readInventory().map(node => ({
        ...node,
        status: qemuService.isRunning(node.name) ? 'running' : 'stopped',
        guacamoleUrl: `http://localhost:8080/guacamole/#/client/${node.name}`
    }));
    res.json(nodes);
};

// Create a new node
exports.createNode = async (req, res) => {
    try {
        const nodes = readInventory();
        const nodeId = nodes.length + 1;
        const nodeName = `node_${nodeId}`;

        const overlay = await qemuService.createOverlay(nodeName);

        const newNode = {
            name: nodeName,
            image: overlay.overlayPath,
            ip: `192.168.56.${10 + nodeId}`
        };

        nodes.push(newNode);
        writeInventory(nodes);

        res.json(newNode);
    } catch (err) {
        console.error('Error creating node:', err);
        res.status(500).json({ error: err.message });
    }
};

// Start a node
exports.runNode = async (req, res) => {
    const nodeName = req.params.id;
    const node = readInventory().find(n => n.name === nodeName);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    try {
        const result = await qemuService.runVM(node.name, path.resolve(node.image));
        res.json({
            success: true,
            hostSSHPort: result.hostSSHPort,
            vncPort: result.vncPort,
            guacamoleUrl: `http://localhost:8080/guacamole/#/client/${node.name}`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// Stop a node
exports.stopNode = async (req, res) => {
    const nodeName = req.params.id;
    const node = readInventory().find(n => n.name === nodeName);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    try {
        await qemuService.stopVM(node.name);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// Wipe a node
exports.wipeNode = async (req, res) => {
    const nodeName = req.params.id;
    const node = readInventory().find(n => n.name === nodeName);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    try {
        if (qemuService.isRunning(node.name)) await qemuService.stopVM(node.name);
        await qemuService.wipeOverlay(node.name, path.resolve(node.image));
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

// Wipe all nodes (stop + wipe)
exports.wipeAllNodes = async (req, res) => {
    const nodes = readInventory();
    try {
        for (const node of nodes) {
            if (qemuService.isRunning(node.name)) await qemuService.stopVM(node.name);
            await qemuService.wipeOverlay(node.name, path.resolve(node.image));
        }
        res.json({ success: true, message: 'All nodes stopped and wiped' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
