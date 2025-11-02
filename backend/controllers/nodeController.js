const fs = require('fs');
const path = require('path');
const qemuService = require('../services/qemuService');
const guacamoleService = require('../services/guacamoleService');

// ✅ Correct inventory path
const inventoryPath = path.join(__dirname, '../inventory.json');

// --------------------------------------------------------
// Utility Functions
// --------------------------------------------------------
function readInventory() {
  if (!fs.existsSync(inventoryPath)) return [];
  return JSON.parse(fs.readFileSync(inventoryPath, 'utf8')).nodes || [];
}

function writeInventory(nodes) {
  fs.writeFileSync(inventoryPath, JSON.stringify({ nodes }, null, 2));
}

// --------------------------------------------------------
// ✅ Reset All Nodes to "stopped" on Backend Startup
// --------------------------------------------------------
function resetAllNodesToStopped() {
  try {
    const data = fs.readFileSync(inventoryPath, 'utf-8');
    const inventory = JSON.parse(data);

    // Mark all nodes stopped
    inventory.nodes = inventory.nodes.map(node => ({
      ...node,
      status: 'stopped'
    }));

    fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));
    console.log('✅ All nodes reset to stopped on backend startup.');
  } catch (err) {
    console.error('❌ Failed to reset node states:', err);
  }
}

// Run reset once when backend starts
resetAllNodesToStopped();

// --------------------------------------------------------
// Controllers
// --------------------------------------------------------
exports.listNodes = async (req, res) => {
  try {
    const nodes = readInventory();

    // 🔥 Just trust inventory.json file for status
    const result = nodes.map((node) => ({
      ...node,
      guacamoleUrl: node.status === 'running'
        ? `http://localhost:8080/guacamole/#/client/${node.connectionId || ''}`
        : null
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
    const node = {
      name: nodeName,
      image: overlay.overlayPath,
      ip: `192.168.56.${10 + nodeId}`,
      status: 'stopped'
    };

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

exports.createRouter = async (req, res) => {
  try {
    const nodes = readInventory();
    const routerName = 'router_1';
    const overlay = await qemuService.createRouterOverlay(routerName);

    const routerNode = {
      name: routerName,
      image: overlay.overlayPath,
      ip: '192.168.1.1',
      status: 'stopped'
    };

    nodes.push(routerNode);
    writeInventory(nodes);
    res.json(routerNode);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.runRouter = async (req, res) => {
  try {
    const routerName = 'router_1';
    const node = readInventory().find(n => n.name === routerName);
    if (!node) throw new Error('Router not found');

    // Run router VM
    const result = await qemuService.runRouter(routerName, path.resolve(node.image));
    const telnetPort = result.telnetPort || 5000;

    // Create TELNET connection in Guacamole
    const connectionId = await guacamoleService.createConnection(routerName, node.ip, telnetPort, 'telnet');

    res.json({
      success: true,
      telnetPort,
      guacamoleUrl: `http://localhost:8080/guacamole/#/client/${connectionId}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Export reset function if you need to call from app.js
exports.resetAllNodesToStopped = resetAllNodesToStopped;
