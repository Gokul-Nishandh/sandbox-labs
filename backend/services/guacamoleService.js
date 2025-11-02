const mysql = require('mysql2/promise');

// 🚀 Use fixed IP — works perfectly with Docker bridge network
const FIXED_DOCKER_HOST_IP = '172.19.0.1';
console.log(`🌐 Using fixed Docker Host IP: ${FIXED_DOCKER_HOST_IP}`);

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'guacamole_user',
  password: process.env.DB_PASS || 'guacamole',
  database: process.env.DB_NAME || 'guacamole_db',
  waitForConnections: true,
  connectionLimit: 10
});

async function ensureCorrectHostname() {
  try {
    await db.query(
      `UPDATE guacamole_connection_parameter
       SET parameter_value = ?
       WHERE parameter_name = 'hostname'`,
      [FIXED_DOCKER_HOST_IP]
    );
    console.log(`🔧 Updated Guacamole hostnames → ${FIXED_DOCKER_HOST_IP}`);
  } catch (err) {
    console.error('❌ Failed to update Guacamole hostnames:', err.message);
  }
}

/**
 * Create or update a Guacamole connection
 * @param {string} nodeName - Node or router name
 * @param {string} hostIP - IP address (unused, always uses FIXED_DOCKER_HOST_IP)
 * @param {number} port - VNC or Telnet port
 * @param {string} protocol - 'vnc' or 'telnet' (default: 'vnc')
 */
exports.createConnection = async (nodeName, hostIP, port, protocol = 'vnc') => {
  try {
    await ensureCorrectHostname();

    // Check if this node already exists
    const [existing] = await db.query(
      'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
      [nodeName]
    );

    let connectionId;
    if (existing.length > 0) {
      connectionId = existing[0].connection_id;

      // Just update the port if already exists
      await db.query(
        `UPDATE guacamole_connection_parameter
         SET parameter_value = ?
         WHERE connection_id = ? AND parameter_name = 'port'`,
        [String(port), connectionId]
      );

      console.log(`🔄 Updated ${nodeName}: ${FIXED_DOCKER_HOST_IP}:${port}`);
      return connectionId;
    }

    // Otherwise create new entry
    const [insert] = await db.query(
      `INSERT INTO guacamole_connection (connection_name, protocol, max_connections, max_connections_per_user)
       VALUES (?, ?, 5, 5)`,
      [nodeName, protocol]
    );

    connectionId = insert.insertId;

    // Common parameters (VNC or Telnet)
    const params =
      protocol === 'telnet'
        ? [
            ['hostname', FIXED_DOCKER_HOST_IP],
            ['port', String(port)]
          ]
        : [
            ['hostname', FIXED_DOCKER_HOST_IP],
            ['port', String(port)],
            ['color-depth', '24'],
            ['cursor', 'local']
          ];

    // Insert connection parameters
    for (const [name, value] of params) {
      await db.query(
        `INSERT INTO guacamole_connection_parameter (connection_id, parameter_name, parameter_value)
         VALUES (?, ?, ?)`,
        [connectionId, name, value]
      );
    }

    // Grant guacadmin access
    await db.query(
      `INSERT INTO guacamole_connection_permission (entity_id, connection_id, permission)
       VALUES ((SELECT entity_id FROM guacamole_entity WHERE name='guacadmin'), ?, 'READ')`,
      [connectionId]
    );

    console.log(`✅ Created ${nodeName}: ${FIXED_DOCKER_HOST_IP}:${port}`);
    return connectionId;
  } catch (err) {
    console.error(`❌ Error creating connection for ${nodeName}:`, err.message);
    throw err;
  }
};

exports.deleteConnection = async (nodeName) => {
  try {
    await db.query('DELETE FROM guacamole_connection WHERE connection_name = ?', [nodeName]);
    console.log(`🗑️ Deleted Guacamole entry for ${nodeName}`);
  } catch (err) {
    console.error(`❌ Error deleting ${nodeName}:`, err.message);
  }
};

exports.getConnectionId = async (nodeName) => {
  const [rows] = await db.query(
    'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
    [nodeName]
  );
  return rows.length ? rows[0].connection_id : null;
};

// Run hostname fix once at startup
ensureCorrectHostname();
