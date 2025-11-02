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
  connectionLimit: 10,
});

/**
 * Ensure all Guacamole hostname parameters are synced to the fixed Docker bridge IP.
 */
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


    // 🧠 Force correct protocol and port for routers
    if (nodeName.startsWith('router')) {
      protocol = 'telnet';
      port = 5950; // ✅ Always fixed port
    }

    console.log(`🧩 DEBUG: Creating/Updating ${nodeName} on port ${port}, protocol ${protocol}`);

    // Check if the connection already exists
    const [existing] = await db.query(
      'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
      [nodeName]
    );

    let connectionId;

    if (existing.length > 0) {
      connectionId = existing[0].connection_id;

      // ✅ Ensure correct port update or insert if missing
      const [updateResult] = await db.query(
        `UPDATE guacamole_connection_parameter
         SET parameter_value = ?
         WHERE connection_id = ? AND parameter_name = 'port'`,
        [String(port), connectionId]
      );

      if (updateResult.affectedRows === 0) {
        await db.query(
          `INSERT INTO guacamole_connection_parameter (connection_id, parameter_name, parameter_value)
           VALUES (?, 'port', ?)`,
          [connectionId, String(port)]
        );
        console.log(`🆕 Inserted missing port for ${nodeName}`);
      } else {
        console.log(`🔄 Updated ${nodeName} port → ${port}`);
      }

      console.log(`✅ Existing ${nodeName} updated: ${FIXED_DOCKER_HOST_IP}:${port}`);
      return connectionId;
    }

    // ------------------------------------------------------
    // 🆕 Create new Guacamole connection if not exists
    // ------------------------------------------------------
    const [insert] = await db.query(
      `INSERT INTO guacamole_connection (connection_name, protocol, max_connections, max_connections_per_user)
       VALUES (?, ?, 5, 5)`,
      [nodeName, protocol]
    );

    connectionId = insert.insertId;

    // Parameters depending on protocol
    const params =
      protocol === 'telnet'
        ? [
            ['hostname', FIXED_DOCKER_HOST_IP],
            ['port', String(port)],
          ]
        : [
            ['hostname', FIXED_DOCKER_HOST_IP],
            ['port', String(port)],
            ['color-depth', '24'],
            ['cursor', 'local'],
          ];

    // Insert parameters
    for (const [name, value] of params) {
      await db.query(
        `INSERT INTO guacamole_connection_parameter (connection_id, parameter_name, parameter_value)
         VALUES (?, ?, ?)`,
        [connectionId, name, value]
      );
    }

    console.log(`🧩 DEBUG: Creating/Updating ${nodeName} on port ${port}, protocol ${protocol}`);


    // Give guacadmin READ access
    await db.query(
      `INSERT INTO guacamole_connection_permission (entity_id, connection_id, permission)
       VALUES ((SELECT entity_id FROM guacamole_entity WHERE name='guacadmin'), ?, 'READ')`,
      [connectionId]
    );

    console.log(`✅ Created ${nodeName}: ${FIXED_DOCKER_HOST_IP}:${port} (${protocol})`);

    // Debug print for verification
    const [rows] = await db.query(
      `SELECT parameter_name, parameter_value FROM guacamole_connection_parameter WHERE connection_id = ?`,
      [connectionId]
    );
    console.log('📋 Final parameters for', nodeName, rows);

    return connectionId;
  } catch (err) {
    console.error(`❌ Error creating connection for ${nodeName}:`, err.message);
    throw err;
  }
};

/**
 * Delete a Guacamole connection by name.
 */
exports.deleteConnection = async (nodeName) => {
  try {
    await db.query('DELETE FROM guacamole_connection WHERE connection_name = ?', [nodeName]);
    console.log(`🗑️ Deleted Guacamole entry for ${nodeName}`);
  } catch (err) {
    console.error(`❌ Error deleting ${nodeName}:`, err.message);
  }
};

/**
 * Get a connection_id by name.
 */
exports.getConnectionId = async (nodeName) => {
  const [rows] = await db.query(
    'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
    [nodeName]
  );
  return rows.length ? rows[0].connection_id : null;
};

// Run hostname fix once at startup
ensureCorrectHostname();
