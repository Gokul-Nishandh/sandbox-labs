const mysql = require('mysql2/promise');
const { execSync } = require('child_process');

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

exports.createConnection = async (nodeName, hostIP, vncPort) => {
    try {
        await ensureCorrectHostname();

        const [existing] = await db.query(
            'SELECT connection_id FROM guacamole_connection WHERE connection_name = ?',
            [nodeName]
        );

        if (existing.length > 0) {
            const connectionId = existing[0].connection_id;
            await db.query(
                `UPDATE guacamole_connection_parameter
                 SET parameter_value = ?
                 WHERE connection_id = ? AND parameter_name = 'port'`,
                [String(vncPort), connectionId]
            );

            console.log(`🔄 Updated ${nodeName}: ${FIXED_DOCKER_HOST_IP}:${vncPort}`);
            return connectionId;
        }

        const [insert] = await db.query(
            `INSERT INTO guacamole_connection (connection_name, protocol, max_connections, max_connections_per_user)
             VALUES (?, 'vnc', 5, 5)`,
            [nodeName]
        );

        const connectionId = insert.insertId;

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
                `INSERT INTO guacamole_connection_parameter (connection_id, parameter_name, parameter_value)
                 VALUES (?, ?, ?)`,
                [connectionId, name, value]
            );
        }

        await db.query(
            `INSERT INTO guacamole_connection_permission (entity_id, connection_id, permission)
             VALUES ((SELECT entity_id FROM guacamole_entity WHERE name='guacadmin'), ?, 'READ')`,
            [connectionId]
        );

        console.log(`✅ Created ${nodeName}: ${FIXED_DOCKER_HOST_IP}:${vncPort}`);
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

ensureCorrectHostname();
