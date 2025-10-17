import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:5000';

export default function NodeList() {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState({});
  const timerRef = useRef({});

  // Fetch nodes from backend
  const fetchNodes = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/nodes`);
      const fetchedNodes = res.data;
      console.log(nodes)
      setNodes(fetchedNodes);

      // Initialize timers for new nodes
      const newTimer = { ...timerRef.current };
      fetchedNodes.forEach(node => {
        if (!(node.name in newTimer)) newTimer[node.name] = timer[node.name] || 0;
      });
      timerRef.current = newTimer;
      setTimer({ ...newTimer });
    } catch (err) {
      console.error('Error fetching nodes:', err);
    }
    setLoading(false);
  };

  // Handle node actions
  const handleAction = async (nodeName, action) => {
    try {
      await axios.post(`${API_BASE}/nodes/${nodeName}/${action}`);
      await fetchNodes();
    } catch (err) {
      console.error(err);
      alert(`Failed to ${action} ${nodeName}`);
    }
  };

  // Add new node
  const handleAddNode = async () => {
    try {
      await axios.post(`${API_BASE}/nodes`);
      await fetchNodes();
    } catch (err) {
      console.error(err);
      alert('Failed to create node');
    }
  };

  // Delete all nodes
  const handleDeleteAll = async () => {
    if (!window.confirm('Are you sure you want to delete all nodes?')) return;
    try {
      await axios.post(`${API_BASE}/nodes/wipeAll`);
      timerRef.current = {}; // reset timers
      setTimer({});
      await fetchNodes();
    } catch (err) {
      console.error(err);
      alert('Failed to delete all nodes');
    }
  };

  // Timer update
  useEffect(() => {
    const interval = setInterval(() => {
      const updated = { ...timerRef.current };
      nodes.forEach(node => {
        if (node.status === 'running') updated[node.name] += 1;
      });
      timerRef.current = updated;
      setTimer({ ...updated });
    }, 1000);
    return () => clearInterval(interval);
  }, [nodes]);

  useEffect(() => {
    fetchNodes();
  }, []);

  const formatTime = (seconds) => {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="container mx-auto p-6 bg-gray-50 min-h-screen">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">SandBox Labs</h1>
        <div className="flex space-x-3">
          <button
            onClick={handleAddNode}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow-md transition duration-200"
          >
            Add Node
          </button>
          <button
            onClick={handleDeleteAll}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded shadow-md transition duration-200"
          >
            Delete All
          </button>
        </div>
      </header>

      {loading ? (
        <p className="text-gray-600 text-lg">Loading nodes...</p>
      ) : nodes.length === 0 ? (
        <p className="text-gray-600 text-lg">No nodes available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 shadow-lg rounded-lg overflow-hidden">
            <thead className="bg-gray-100">
              <tr>
                <th className="py-3 px-5 text-left text-gray-700">Name</th>
                <th className="py-3 px-5 text-left text-gray-700">Status</th>
                <th className="py-3 px-5 text-left text-gray-700">Uptime</th>
                <th className="py-3 px-5 text-left text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node, idx) => (
                <tr
                  key={node.name}
                  className={`transition duration-150 hover:bg-gray-100 ${
                    idx % 2 === 0 ? '' : 'bg-gray-50'
                  }`}
                >
                  <td className="py-3 px-5 font-medium text-gray-800">{node.name}</td>
                  <td className="py-3 px-5">
                    <span
                      className={`px-2 py-1 rounded-full text-white text-sm font-semibold ${
                        node.status === 'running' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    >
                      {node.status}
                    </span>
                  </td>
                  <td className="py-3 px-5 font-mono text-gray-700">{formatTime(timer[node.name] || 0)}</td>
                  <td className="py-3 px-5 space-x-2">
                    <button
                      onClick={() => handleAction(node.name, 'run')}
                      disabled={node.status === 'running'}
                      className={`px-3 py-1 rounded text-white transition duration-200 ${
                        node.status === 'running'
                          ? 'bg-green-300 cursor-not-allowed'
                          : 'bg-green-500 hover:bg-green-600 shadow'
                      }`}
                    >
                      Start
                    </button>
                    <button
                      onClick={() => handleAction(node.name, 'stop')}
                      disabled={node.status === 'stopped'}
                      className={`px-3 py-1 rounded text-white transition duration-200 ${
                        node.status === 'stopped'
                          ? 'bg-yellow-300 cursor-not-allowed'
                          : 'bg-yellow-500 hover:bg-yellow-600 shadow'
                      }`}
                    >
                      Stop
                    </button>
                    <button
                      onClick={() => handleAction(node.name, 'wipe')}
                      className="px-3 py-1 rounded bg-red-500 hover:bg-red-600 text-white transition duration-200 shadow"
                    >
                      Wipe
                    </button>
                    <button
                      onClick={() => window.open(node.guacamoleUrl, '_blank')}
                      className="px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition duration-200 shadow"
                    >
                      Open Console
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
