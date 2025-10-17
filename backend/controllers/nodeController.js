const fs = require('fs');
const path = require('path');
const qemuService = require('../services/qemuService');
const guacamoleService = require('../services/guacamoleService');
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

exports.listNodes = async (req, res) => {
    const nodes = readInventory();
    const nodesWithStatus = await Promise.all(
        nodes.map(async (node) => {
            const status = qemuService.isRunning(node.name) ? 'running' : 'stopped';

            // fetch actual connection id from DB
            let guacUrl = null;
            if (status === 'running') {
                const connectionId = await guacamoleService.getConnectionId(node.name);
                if (connectionId) guacUrl = `http://localhost:8080/guacamole/#/client/${connectionId}`;
            }

            return { ...node, status, guacamoleUrl: guacUrl };
        })
    );

    res.json(nodesWithStatus);
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


exports.runNode = async (req, res) => {
    const nodeName = req.params.id;
    const node = readInventory().find(n => n.name === nodeName);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    try {
        const result = await qemuService.runVM(node.name, path.resolve(node.image));

        // Map correct host IP + VNC port for Guacamole
        const hostIP = node.ip;
        const connectionId = await guacamoleService.createConnection(node.name, hostIP, result.vncPort);

        const guacUrl = `http://localhost:8080/guacamole/#/client/${connectionId}`;
        console.log("From runNode",guacUrl);
        res.json({
            success: true,
            hostSSHPort: result.hostSSHPort,
            vncPort: result.vncPort,
            guacamoleUrl: guacUrl
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.stopNode = async (req, res) => {
    const nodeName = req.params.id;
    const node = readInventory().find(n => n.name === nodeName);
    if (!node) return res.status(404).json({ error: 'Node not found' });

    try {
        if (qemuService.isRunning(node.name)) {
            await qemuService.stopVM(node.name);
        } else {
            console.warn(`VM ${node.name} is not running`);
        }
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
