# Sandbox-Labs 🚀

**Minimal Network Lab with QEMU Overlays**

A prototype network lab environment to create and manage virtual nodes using **QEMU disk overlays**. Nodes can be started, stopped, and wiped, with VNC access for remote console management. Frontend is built with React, and backend is powered by Express.

---

## ✨ Features

- 🖥️ Create multiple virtual nodes using QEMU overlays
- 🔄 Node lifecycle management via REST API:
  - **Run** → Boot VM
  - **Stop** → Shut down VM
  - **Wipe** → Delete overlay and recreate
- 🎛️ Frontend UI to manage nodes and view status
- 🔌 VNC console access to running nodes (via Guacamole or any VNC client)
- 💾 Efficient overlay usage with `qemu-img` backing files
- ⚡ Supports multiple nodes running concurrently

---

## 🛠️ Tech Stack

- **Frontend:** React
- **Backend:** Node.js + Express
- **Virtualization:** QEMU
- **Remote Access:** VNC (Guacamole integration pending)
- **Containerization:** Docker (recommended for Guacamole)

---

## 📋 Prerequisites

Make sure the following are installed on your system:

### **Node.js & npm**
node -v
npm -v


### **Git**
git --version


### **QEMU**
qemu-system-x86_64 --version


### **VNC Client**
- Examples: Remmina, TigerVNC, RealVNC


## 🚀 Project Setup

### 1. Clone the Repository
git clone https://github.com/Gokul-Nishandh/sandbox-labs.git
cd sandbox-labs


### 2. Download Base Image
You need a base OS image (e.g., Ubuntu cloud image) to create QEMU overlays.

mkdir -p images
cd images
wget https://cloud-images.ubuntu.com/focal/current/focal-server-cloudimg-amd64.img -O base.qcow2
cd ..

*This will download the base image and save it as `images/base.qcow2`.*

### 3. Backend Setup
cd backend
npm install


**Create Overlays Directory:**
mkdir -p overlays


### 4. Frontend Setup
cd ../frontend
npm install
npm start

*Access the frontend UI at `http://localhost:3000`*

---

## 🖥️ Running Nodes

### Start a VM manually (optional)
qemu-system-x86_64 \
  -drive file=/home/yourusername/sandbox-labs/backend/overlays/node_2.qcow2,format=qcow2 \
  -m 2048 \
  -net user,hostfwd=tcp::2223-:22 \
  -net nic \
  -vnc :2


*Replace `node_2.qcow2` and port numbers as needed.*

*Access the VM via a VNC client at `localhost:5902` (`:2` → 5902)*

---

## 🔌 Backend API Endpoints

| Method | Endpoint | Description |
|--------|-----------|-------------|
| POST | `/nodes` | Create a new overlay node |
| POST | `/nodes/:id/run` | Start a VM node |
| POST | `/nodes/:id/stop` | Stop a VM node |
| POST | `/nodes/:id/wipe` | Wipe overlay and recreate |
| GET | `/nodes` | List nodes with status & VNC info |

---

## 🎮 Node Actions in Frontend

- ➕ **Add Node** → Creates a new overlay node
- ▶️ **Run** → Boots the VM
- ⏹️ **Stop** → Shut down the VM
- 🗑️ **Wipe** → Delete overlay and recreate it
- 👆 **Click running node** → Open VNC console (Guacamole integration pending)

---

## 📝 Notes

- 🔄 Guacamole integration is not yet completed; currently, you can access running nodes via any VNC client using the assigned port.
- 💾 Each node uses QEMU overlays efficiently to save space and allow easy node reset.
- ⚡ Supports multiple nodes running concurrently.

---

## 🚧 Future Improvements

- 🌐 Full Guacamole integration for browser-based console access
- 🔗 Persistent network configurations between nodes
- 🐳 Docker Compose setup for automating backend, frontend, and Guacamole

---

## 👨‍💻 Author

**Gokul Nishandh** - [https://github.com/Gokul-Nishandh](https://github.com/Gokul-Nishandh)

---

*⭐ Star this repo if you find it useful!*
```
