Here’s a polished and fully updated README for your **Sandbox-Labs** project with the Guacamole integration instructions included:

---

# Sandbox-Labs 🚀

**Minimal Network Lab with QEMU Overlays**

A prototype network lab environment to create and manage virtual nodes using **QEMU disk overlays**. Nodes can be started, stopped, and wiped, with **VNC/Guacamole access** for remote console management. Frontend is built with React, and backend is powered by Express.

---

## ✨ Features

* 🖥️ Create multiple virtual nodes using QEMU overlays
* 🔄 Node lifecycle management via REST API:

  * **Run** → Boot VM
  * **Stop** → Shut down VM
  * **Wipe** → Delete overlay and recreate
* 🎛️ Frontend UI to manage nodes and view status
* 🔌 **Guacamole console access** to running nodes (click a node to open directly in Guacamole)
* 💾 Efficient overlay usage with `qemu-img` backing files
* ⚡ Supports multiple nodes running concurrently

---

## 🛠️ Tech Stack

* **Frontend:** React
* **Backend:** Node.js + Express
* **Virtualization:** QEMU
* **Remote Access:** VNC / Guacamole
* **Containerization:** Docker (recommended for Guacamole)

---

## 📋 Prerequisites

Make sure the following are installed on your system:

### **Node.js & npm**

```bash
node -v
npm -v
```

### **Git**

```bash
git --version
```

### **QEMU**

```bash
qemu-system-x86_64 --version
```

### **VNC Client (optional)**

* Examples: Remmina, TigerVNC, RealVNC

---

## 🚀 Project Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Gokul-Nishandh/sandbox-labs.git
cd sandbox-labs
```

### 2. Download Base Image

You need a base OS image (e.g., Ubuntu cloud image) to create QEMU overlays.

```bash
mkdir -p images
cd images
wget https://cloud-images.ubuntu.com/focal/current/focal-server-cloudimg-amd64.img -O base.qcow2
cd ..
```

*This will download the base image and save it as `images/base.qcow2`.*

---

### 3. Backend Setup

```bash
cd backend
npm install
mkdir -p overlays
```

---

### 4. Frontend Setup

```bash
cd ../frontend
npm install
npm start
```

*Access the frontend UI at `http://localhost:3000`*

---

### 5. Guacamole Integration (Docker)

To enable direct VM console access via Guacamole, follow this guide: [Guacamole Docker Installation](https://www.youtube.com/watch?v=PH8Hkji0CZE&t=1492s)

1. Use the **docker-compose.txt** file provided in the video and **paste it in your project directory**.
2. Update the **IP addresses** in the docker-compose file according to your system/network.
3. Start Guacamole using:

```bash
docker-compose up -d
```

4. Once running, you can access Guacamole at `http://<your-system-ip>:8080`.
5. Clicking **Open Console** in the frontend will now launch the node directly in Guacamole.

---

## 🖥️ Running Nodes

### Start a VM manually (optional)

```bash
qemu-system-x86_64 \
  -drive file=/home/yourusername/sandbox-labs/backend/overlays/node_2.qcow2,format=qcow2 \
  -m 2048 \
  -net user,hostfwd=tcp::2223-:22 \
  -net nic \
  -vnc :2
```

*Replace `node_2.qcow2` and port numbers as needed.*

*Access the VM via a VNC client at `localhost:5902` (`:2` → 5902)*

---

## 🔌 Backend API Endpoints

| Method | Endpoint          | Description                                 |
| ------ | ----------------- | ------------------------------------------- |
| POST   | `/nodes`          | Create a new overlay node                   |
| POST   | `/nodes/:id/run`  | Start a VM node                             |
| POST   | `/nodes/:id/stop` | Stop a VM node                              |
| POST   | `/nodes/:id/wipe` | Wipe overlay and recreate                   |
| GET    | `/nodes`          | List nodes with status & VNC/Guacamole info |

---

## 🎮 Node Actions in Frontend

* ➕ **Add Node** → Creates a new overlay node
* ▶️ **Run** → Boots the VM
* ⏹️ **Stop** → Shut down the VM
* 🗑️ **Wipe** → Delete overlay and recreate it
* 👆 **Click running node** → Open **Guacamole console** (direct browser access)

---

## 📝 Notes

* 💾 Each node uses **QEMU overlays** efficiently to save space and allow easy node reset.
* ⚡ Supports multiple nodes running concurrently.
* 🌐 Guacamole integration allows browser-based console access.

---

## 🚧 Future Improvements

* 🔗 Persistent network configurations between nodes
* 🐳 Docker Compose setup for automating backend, frontend, and Guacamole together
* 🔒 Role-based access for nodes in Guacamole

---

## 👨‍💻 Author

**Gokul Nishandh** - [GitHub](https://github.com/Gokul-Nishandh)

---

*⭐ Star this repo if you find it useful!*

---

If you want, I can also **update your frontend instructions** to show **automatic Guacamole IP and port assignment per node**, so clicking “Open Console” always works seamlessly without manual IP setup. This would make the lab fully plug-and-play.

Do you want me to do that too?
