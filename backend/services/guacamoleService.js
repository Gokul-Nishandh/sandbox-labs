// services/guacamoleService.js
const mysql = require('mysql2/promise');

// MySQL connection pool
const db = mysql.createPool({
    host: 'localhost',       // MySQL host (Docker exposes it)
    port: 3306,
    user: 'guacamole_user',
    password: 'guacamole',
    database: 'guacamole_db'
});

/**
 * Create a new VNC connection in Guacamole
 * @param {string} nodeName - Name of the VM node
 * @returns {number} - Guacamole connection ID
 */


// get connection ID by node name
exports.getConnectionId = async (nodeName) => {
    const [rows] = await db.query(
        'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
        [nodeName]
    );
    return rows.length > 0 ? rows[0].connection_id : null;
};


exports.createConnection = async (nodeName) => {
    // 1️⃣ Check if the connection already exists
    const [existing] = await db.query(
        'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
        [nodeName]
    );
    if (existing.length > 0) return existing[0].connection_id;

    // 2️⃣ Create new connection entry (VNC protocol)
    const [result] = await db.query(
        `INSERT INTO guacamole_connection 
         (connection_name, protocol, max_connections, max_connections_per_user)
         VALUES (?, 'vnc', 5, 5)`,
        [nodeName]
    );
    const connectionId = result.insertId;

    // 3️⃣ Add connection parameters (hardcoded for testing)
    const params = [
        ['hostname', '192.168.207.6'], // 🔹 Hardcoded VM IP
        ['port', '5901'],              // 🔹 Hardcoded VNC port
        ['password', '']               // No VNC password
    ];

    for (const [name, value] of params) {
        await db.query(
            'INSERT INTO guacamole_connection_parameter (connection_id, parameter_name, parameter_value) VALUES (?, ?, ?)',
            [connectionId, name, value]
        );
    }

    // 4️⃣ Fetch guacadmin user_id
    const [users] = await db.query(`
        SELECT guacamole_user.user_id
        FROM guacamole_user
        JOIN guacamole_entity 
          ON guacamole_user.entity_id = guacamole_entity.entity_id
        WHERE guacamole_entity.name = 'guacadmin'
    `);

    // 5️⃣ Grant READ permission to guacadmin
    if (users.length > 0) {
        await db.query(
            'INSERT INTO guacamole_connection_permission (user_id, connection_id, permission) VALUES (?, ?, "READ")',
            [users[0].user_id, connectionId]
        );
    }
    console.log(connectionId)
    return connectionId;
};
