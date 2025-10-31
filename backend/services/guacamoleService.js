// services/guacamoleService.js
const mysql = require('mysql2/promise');

/**
 * Direct MySQL connection to guac-db container
 * Matches your docker-compose.yml configuration
 */
const db = mysql.createPool({
    host: 'localhost',          // Use 'localhost' since MySQL is exposed on 3306
    port: 3306,
    user: 'guacamole_user',
    password: 'guacamole',
    database: 'guacamole_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

/**
 * Creates or updates a Guacamole connection entry dynamically.
 * Only the VNC port changes — hostname, password, etc. remain constant.
 */
exports.createConnection = async (nodeName, hostname, vncPort) => {
    try {
        // Step 1️⃣: Check if connection already exists
        const [existing] = await db.query(
            'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
            [nodeName]
        );

        if (existing.length > 0) {
            const connectionId = existing[0].connection_id;

            // Step 2️⃣: Update only the port parameter
            await db.query(
                `UPDATE guacamole_connection_parameter
                 SET parameter_value = ?
                 WHERE connection_id = ? AND parameter_name = 'port'`,
                [String(vncPort), connectionId]
            );

            console.log(`🔄 Updated VNC port for ${nodeName} → ${vncPort}`);
            return connectionId;
        }

        // Step 3️⃣: Create a new Guacamole connection
        const [result] = await db.query(
            `INSERT INTO guacamole_connection 
             (connection_name, protocol, max_connections, max_connections_per_user)
             VALUES (?, 'vnc', 5, 5)`,
            [nodeName]
        );
        const connectionId = result.insertId;

        // Step 4️⃣: Insert all Guacamole connection parameters
        const params = [
['hostname', hostname || '172.19.0.1'],
            ['port', String(vncPort)],                 // 🔹 dynamic VNC port
            ['password', ''],                          // ✅ same as before
            ['enable-sftp', 'false'],
            ['color-depth', '24'],
            ['cursor', 'local']
        ];

        for (const [name, value] of params) {
            await db.query(
                `INSERT INTO guacamole_connection_parameter
                 (connection_id, parameter_name, parameter_value)
                 VALUES (?, ?, ?)`,
                [connectionId, name, value]
            );
        }

        // Step 5️⃣: Grant guacadmin READ access (✅ fixed entity_id issue)
        await db.query(
            `INSERT INTO guacamole_connection_permission (entity_id, connection_id, permission)
             VALUES ((SELECT entity_id FROM guacamole_entity WHERE name = 'guacadmin'), ?, 'READ')`,
            [connectionId]
        );

        console.log(`✅ Created new Guacamole connection ${connectionId} for ${nodeName} (port ${vncPort})`);
        return connectionId;

    } catch (err) {
        console.error(`❌ Error creating Guacamole connection for ${nodeName}:`, err);
        throw err;
    }
};

/**
 * Optional helper: Delete connection when node is wiped
 */
exports.deleteConnection = async (nodeName) => {
    try {
        await db.query('DELETE FROM guacamole_connection WHERE connection_name = ?', [nodeName]);
        console.log(`🗑️ Deleted Guacamole connection for ${nodeName}`);
    } catch (err) {
        console.error(`❌ Error deleting Guacamole connection for ${nodeName}:`, err);
    }
};

/**
 * Helper to fetch an existing connection ID by node name
 */
exports.getConnectionId = async (nodeName) => {
    const [rows] = await db.query(
        'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
        [nodeName]
    );
    return rows.length > 0 ? rows[0].connection_id : null;
};
