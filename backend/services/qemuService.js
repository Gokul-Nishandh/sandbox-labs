const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');

// --- PATHS ---
const IMAGE_DIR = path.join(__dirname, '../images');
const OVERLAY_DIR = path.join(__dirname, '../overlays');
const INVENTORY_PATH = path.join(__dirname, '../inventory.json');

const BASE_IMAGE_PATH = path.join(IMAGE_DIR, 'base2.qcow2');
const ROUTER_IMAGE_PATH = path.join(IMAGE_DIR, 'router_fixed.qcow2');

// Ensure overlay directory exists
if (!fs.existsSync(OVERLAY_DIR)) {
  fs.mkdirSync(OVERLAY_DIR, { recursive: true });
  console.log('📂 Created overlays directory');
}

// --- Utility: Free VNC Port ---
function getRandomPort(base = 5900) {
  for (let i = 1; i < 100; i++) {
    const port = base + i;
    try {
      execSync(`lsof -i:${port}`);
    } catch {
      return port; // free port
    }
  }
  throw new Error('No free VNC ports available!');
}

// --- Utility: Load/Save inventory ---
function loadInventory() {
  if (!fs.existsSync(INVENTORY_PATH)) {
    console.warn('⚠️ inventory.json not found. Creating empty one.');
    fs.writeFileSync(INVENTORY_PATH, JSON.stringify({ nodes: [] }, null, 2));
    return { nodes: [] };
  }
  return JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf-8'));
}

function saveInventory(data) {
  fs.writeFileSync(INVENTORY_PATH, JSON.stringify(data, null, 2));
}

// =======================================================
// ✅ CREATE OVERLAYS
// =======================================================

// Normal node overlay
exports.createOverlay = async (nodeName) => {
  const overlayPath = path.join(OVERLAY_DIR, `${nodeName}.qcow2`);

  // Safety: delete stale overlay if corrupted
  if (fs.existsSync(overlayPath) && fs.statSync(overlayPath).size === 0) {
    fs.unlinkSync(overlayPath);
    console.log(`🧹 Removed empty overlay: ${overlayPath}`);
  }

  const cmd = `qemu-img create -f qcow2 -b ${BASE_IMAGE_PATH} -F qcow2 ${overlayPath}`;
  execSync(cmd);
  console.log(`✅ Overlay created for ${nodeName}`);
  return { overlayPath };
};

// Router overlay
exports.createRouterOverlay = async (routerName) => {
  const overlayPath = path.join(OVERLAY_DIR, `${routerName}.qcow2`);
  if (fs.existsSync(overlayPath)) {
    console.log(`ℹ️ Router overlay already exists for ${routerName}`);
    return { overlayPath };
  }

  execSync(`qemu-img create -f qcow2 -b ${ROUTER_IMAGE_PATH} -F qcow2 ${overlayPath}`);
  console.log(`✅ Router overlay created for ${routerName}`);
  return { overlayPath };
};

// =======================================================
// ✅ RUN VMs
// =======================================================

// Normal VM
exports.runVM = async (nodeName, imagePath) => {
  const vncPort = getRandomPort();
  const nodeNum = parseInt(nodeName.split('_')[1]) || 1;
  const hostSSHPort = 2200 + nodeNum;

  const cmd = `qemu-system-x86_64 -hda ${imagePath} -m 1024 -enable-kvm \
    -net nic -net user,hostfwd=tcp::${hostSSHPort}-:22 \
    -vnc :${vncPort - 5900} -daemonize`;

  execSync(cmd);
  console.log(`🚀 ${nodeName} started → VNC :${vncPort - 5900}, SSH ${hostSSHPort}`);

  // Update inventory
  const inventory = loadInventory();
  const node = inventory.nodes.find((n) => n.name === nodeName);
  if (node) node.status = 'running';
  saveInventory(inventory);

  return { hostSSHPort, vncPort };
};

// Router VM
exports.runRouter = async (routerName, imagePath) => {
  const vncPort = getRandomPort(5950);
  const cmd = `qemu-system-x86_64 -hda ${imagePath} -m 2048 -smp 2 -enable-kvm \
    -net nic -net user \
    -vnc :${vncPort - 5900} -daemonize`;

  execSync(cmd);
  console.log(`🚀 Router ${routerName} started → VNC :${vncPort - 5900}`);

  const inventory = loadInventory();
  const node = inventory.nodes.find((n) => n.name === routerName);
  if (node) node.status = 'running';
  saveInventory(inventory);

  return { vncPort };
};

// =======================================================
// ✅ STOP / WIPE
// =======================================================

// Stop VM safely
exports.stopVM = async (nodeName) => {
  return new Promise((resolve) => {
    exec(`pgrep -f "${nodeName}"`, (err, stdout) => {
      if (!stdout.trim()) {
        console.log(`ℹ️ No active process found for ${nodeName}. Already stopped.`);
        const inventory = loadInventory();
        const node = inventory.nodes.find((n) => n.name === nodeName);
        if (node) node.status = 'stopped';
        saveInventory(inventory);
        return resolve();
      }

      exec(`pkill -f "${nodeName}"`, (killErr) => {
        if (killErr) {
          console.warn(`⚠️ Failed to stop ${nodeName}: ${killErr.message}`);
        } else {
          console.log(`🛑 ${nodeName} stopped successfully`);
        }

        const inventory = loadInventory();
        const node = inventory.nodes.find((n) => n.name === nodeName);
        if (node) node.status = 'stopped';
        saveInventory(inventory);

        resolve();
      });
    });
  });
};

// Wipe + recreate overlay
exports.wipeOverlay = async (nodeName) => {
  try {
    await exports.stopVM(nodeName);

    const overlayPath = path.join(OVERLAY_DIR, `${nodeName}.qcow2`);
    if (fs.existsSync(overlayPath)) {
      fs.unlinkSync(overlayPath);
      console.log(`🧹 Deleted overlay for ${nodeName}`);
    }

    if (nodeName.startsWith('router')) {
      await exports.createRouterOverlay(nodeName);
    } else {
      await exports.createOverlay(nodeName);
    }

    const inventory = loadInventory();
    const node = inventory.nodes.find((n) => n.name === nodeName);
    if (node) node.status = 'stopped';
    saveInventory(inventory);

    console.log(`🔁 ${nodeName} reset successfully`);
  } catch (err) {
    console.error(`❌ Error resetting ${nodeName}: ${err.message}`);
  }
};

exports.initInventory = () => {
  const inventory = loadInventory();

  // 🧹 Kill any leftover QEMU processes to ensure a clean start
  try {
    require('child_process').execSync('pkill -f qemu-system-x86_64 || true');
    console.log('🧹 Cleaned up leftover QEMU processes');
  } catch {
    console.warn('⚠️ No QEMU processes found to clean.');
  }

  // Mark all nodes as stopped
  inventory.nodes.forEach((n) => (n.status = 'stopped'));
  saveInventory(inventory);
  console.log('📋 All nodes marked as stopped on backend startup');
};

// =======================================================
// ✅ STATUS CHECK
// =======================================================
exports.isRunning = (nodeName) => {
  try {
    execSync(`pgrep -f "${nodeName}"`);
    return true;
  } catch {
    return false;
  }
};
