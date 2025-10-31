// services/guacamoleService.js
const mysql = require('mysql2/promise');

const FIXED_DOCKER_HOST_IP = '172.19.0.1'; // ✅ The only hostname that works for guacd

/**
 * Direct MySQL connection to guac-db container
 */
const db = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'guacamole_user',
    password: 'guacamole',
    database: 'guacamole_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

/**
 * Force all existing Guacamole connections to use the correct Docker host IP.
 */
async function ensureCorrectHostname() {
    try {
        await db.query(
            `UPDATE guacamole_connection_parameter
             SET parameter_value = ?
             WHERE parameter_name = 'hostname'`,
            [FIXED_DOCKER_HOST_IP]
        );
        console.log(`🔧 Updated all Guacamole hostnames → ${FIXED_DOCKER_HOST_IP}`);
    } catch (err) {
        console.error('❌ Failed to update Guacamole hostnames:', err);
    }
}

/**
 * Creates or updates a Guacamole connection dynamically.
 */
exports.createConnection = async (nodeName, _, vncPort) => {
    try {
        // Step 1️⃣: Ensure all connections use correct hostname
        await ensureCorrectHostname();

        // Step 2️⃣: Check if connection exists
        const [existing] = await db.query(
            'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
            [nodeName]
        );

        if (existing.length > 0) {
            const connectionId = existing[0].connection_id;

            // Update VNC port for this node
            await db.query(
                `UPDATE guacamole_connection_parameter
                 SET parameter_value = ?
                 WHERE connection_id = ? AND parameter_name = 'port'`,
                [String(vncPort), connectionId]
            );

            console.log(`🔄 Updated ${nodeName}: host=${FIXED_DOCKER_HOST_IP}, port=${vncPort}`);
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

        // Step 4️⃣: Insert parameters
        const params = [
            ['hostname', FIXED_DOCKER_HOST_IP],
            ['port', String(vncPort)],
            ['password', ''],
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

        // Step 5️⃣: Grant guacadmin access
        await db.query(
            `INSERT INTO guacamole_connection_permission (entity_id, connection_id, permission)
             VALUES ((SELECT entity_id FROM guacamole_entity WHERE name = 'guacadmin'), ?, 'READ')`,
            [connectionId]
        );

        console.log(`✅ Created connection ${nodeName} (${FIXED_DOCKER_HOST_IP}:${vncPort})`);
        return connectionId;

    } catch (err) {
        console.error(`❌ Error creating Guacamole connection for ${nodeName}:`, err);
        throw err;
    }
};

/**
 * Delete a connection
 */
exports.deleteConnection = async (nodeName) => {
    try {
        await db.query('DELETE FROM guacamole_connection WHERE connection_name = ?', [nodeName]);
        console.log(`🗑️ Deleted connection for ${nodeName}`);
    } catch (err) {
        console.error(`❌ Error deleting Guacamole connection for ${nodeName}:`, err);
    }
};

/**
 * Fetch connection ID
 */
exports.getConnectionId = async (nodeName) => {
    const [rows] = await db.query(
        'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
        [nodeName]
    );
    return rows.length > 0 ? rows[0].connection_id : null;
};

// ✅ Auto-fix on startup
ensureCorrectHostname();
