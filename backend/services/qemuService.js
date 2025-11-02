const path = require("path");
const fs = require("fs");
const { execSync, exec } = require("child_process");
const guacamoleService = require("./guacamoleService");

// --- Directories and paths ---
const IMAGE_DIR = path.join(__dirname, "../images");
const OVERLAY_DIR = path.join(__dirname, "../overlays");
const INVENTORY_PATH = path.join(__dirname, "../inventory.json");

const BASE_IMAGE_PATH = path.join(IMAGE_DIR, "base2.qcow2");
const ROUTER_IMAGE_PATH = path.join(IMAGE_DIR, "router.qcow2");

if (!fs.existsSync(OVERLAY_DIR)) {
  fs.mkdirSync(OVERLAY_DIR, { recursive: true });
  console.log("📂 Created overlays directory");
}

// =======================================================
// 🔧 Utility Functions
// =======================================================

// --- Find a free VNC port ---
function getRandomPort(base = 5900) {
  for (let i = 1; i < 100; i++) {
    const port = base + i;
    try {
      execSync(`lsof -i:${port}`);
    } catch {
      return port; // Free port found
    }
  }
  throw new Error("❌ No free VNC ports available!");
}

// --- Load / Save Inventory ---
function loadInventory() {
  if (!fs.existsSync(INVENTORY_PATH)) {
    fs.writeFileSync(INVENTORY_PATH, JSON.stringify({ nodes: [] }, null, 2));
    return { nodes: [] };
  }
  return JSON.parse(fs.readFileSync(INVENTORY_PATH, "utf-8"));
}

function saveInventory(data) {
  fs.writeFileSync(INVENTORY_PATH, JSON.stringify(data, null, 2));
}

// --- Create TAP Interfaces Automatically ---
function ensureTapInterface(tapName) {
  try {
    const existing = execSync(`ip link show ${tapName}`).toString();
    if (existing.includes(tapName)) return; // already exists
  } catch {
    console.log(`🧩 Creating TAP interface: ${tapName}`);
    execSync(`sudo ip tuntap add dev ${tapName} mode tap`);
    execSync(`sudo ip link set ${tapName} up`);
  }
}

// --- Build dynamic network arguments ---
function buildNetArgs(nodeName, netCount = 1) {
  let args = "";
  for (let i = 0; i < netCount; i++) {
    const tapName = nodeName.startsWith("router")
      ? `tap-${nodeName}g${i}`
      : `tap-${nodeName}`;
    ensureTapInterface(tapName);
    args += ` -netdev tap,id=net${i},ifname=${tapName},script=no,downscript=no -device e1000,netdev=net${i}`;
  }
  return args;
}

// =======================================================
// 🧱 Overlay Creation
// =======================================================

exports.createOverlay = async (nodeName) => {
  const overlayPath = path.join(OVERLAY_DIR, `${nodeName}.qcow2`);
  const cmd = `qemu-img create -f qcow2 -b ${BASE_IMAGE_PATH} -F qcow2 ${overlayPath}`;
  execSync(cmd);
  console.log(`✅ Overlay created for ${nodeName}`);
  return { overlayPath };
};

exports.createRouterOverlay = async (routerName) => {
  const overlayPath = path.join(OVERLAY_DIR, `${routerName}.qcow2`);
  if (!fs.existsSync(overlayPath)) {
    execSync(`qemu-img create -f qcow2 -b ${ROUTER_IMAGE_PATH} -F qcow2 ${overlayPath}`);
    console.log(`✅ Router overlay created for ${routerName}`);
  }
  return { overlayPath };
};

// =======================================================
// 🚀 Dynamic VM / Router Launcher
// =======================================================

exports.runDynamicVM = async (nodeName) => {
  try {
    const overlayPath = path.join(OVERLAY_DIR, `${nodeName}.qcow2`);
    if (!fs.existsSync(overlayPath)) {
      throw new Error(`Overlay not found: ${overlayPath}`);
    }

    const isRouter = nodeName.startsWith("router");
    const netCount = isRouter ? 2 : 1;
    const netArgs = buildNetArgs(nodeName, netCount);
    const vncPort = getRandomPort(5900) - 5900; // :1, :2, etc.
    const telnetPort = isRouter ? 5950 : null;

    let cmd = `qemu-system-x86_64 \
      -name ${nodeName} \
      -hda ${overlayPath} \
      -m 1024 \
      -enable-kvm \
      -cpu host \
      ${netArgs} \
      -vnc :${vncPort} \
      -daemonize`;

    if (isRouter) {
      cmd += ` -serial telnet:0.0.0.0:${telnetPort},server,nowait`;
    }

    console.log(`🚀 Launching ${isRouter ? "Router" : "VM"} → ${cmd}`);
    execSync(cmd);

    // 🗂️ Update inventory
    const inventory = loadInventory();
    const node = inventory.nodes.find((n) => n.name === nodeName);
    if (node) {
      node.status = "running";
      node.vncPort = 5900 + vncPort;
      if (isRouter) node.telnetPort = telnetPort;
    }
    saveInventory(inventory);

    // 🌐 Guacamole integration
    const hostIP = "172.19.0.1";
    let connectionId = null;
    if (isRouter) {
      connectionId = await guacamoleService.createConnection(
        nodeName,
        hostIP,
        telnetPort,
        "telnet"
      );
    } else {
      connectionId = await guacamoleService.createConnection(
        nodeName,
        hostIP,
        5900 + vncPort,
        "vnc"
      );
    }

    const guacUrl = `http://localhost:8080/guacamole/#/client/${connectionId}`;
    console.log(`🌐 Guacamole URL: ${guacUrl}`);

    return { success: true, vncPort, telnetPort, guacUrl };
  } catch (err) {
    console.error(`❌ Failed to start ${nodeName}:`, err.message);
    return { success: false, error: err.message };
  }
};

// =======================================================
// 🛑 Stop / Wipe Functions
// =======================================================

exports.stopVM = async (nodeName) => {
  return new Promise((resolve) => {
    exec(`pgrep -f "${nodeName}"`, (err, stdout) => {
      if (!stdout.trim()) {
        console.log(`ℹ️ No active process found for ${nodeName}. Already stopped.`);
        const inventory = loadInventory();
        const node = inventory.nodes.find((n) => n.name === nodeName);
        if (node) node.status = "stopped";
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
        if (node) node.status = "stopped";
        saveInventory(inventory);

        resolve();
      });
    });
  });
};

exports.wipeOverlay = async (nodeName) => {
  try {
    await exports.stopVM(nodeName);

    const overlayPath = path.join(OVERLAY_DIR, `${nodeName}.qcow2`);
    if (fs.existsSync(overlayPath)) {
      fs.unlinkSync(overlayPath);
      console.log(`🧹 Deleted overlay for ${nodeName}`);
    }

    if (nodeName.startsWith("router")) {
      await exports.createRouterOverlay(nodeName);
    } else {
      await exports.createOverlay(nodeName);
    }

    const inventory = loadInventory();
    const node = inventory.nodes.find((n) => n.name === nodeName);
    if (node) node.status = "stopped";
    saveInventory(inventory);

    console.log(`🔁 ${nodeName} reset successfully`);
  } catch (err) {
    console.error(`❌ Error resetting ${nodeName}: ${err.message}`);
  }
};

// =======================================================
// ⚙️ Init and Status
// =======================================================

exports.initInventory = () => {
  const inventory = loadInventory();

  try {
    require("child_process").execSync("pkill -f qemu-system-x86_64 || true");
    console.log("🧹 Cleaned up leftover QEMU processes");
  } catch {
    console.warn("⚠️ No QEMU processes found to clean.");
  }

  inventory.nodes.forEach((n) => (n.status = "stopped"));
  saveInventory(inventory);
  console.log("📋 All nodes marked as stopped on backend startup");
};

exports.isRunning = (nodeName) => {
  try {
    execSync(`pgrep -f "${nodeName}"`);
    return true;
  } catch {
    return false;
  }
};
