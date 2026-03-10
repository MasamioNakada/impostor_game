/**
 * ClusterManager - Gestiona la conexión P2P usando PeerJS
 * Permite la comunicación entre Host y Slaves
 */

class ClusterManager {
    constructor() {
        this.peer = null;
        this.connections = []; // Para Host: lista de conexiones de esclavos
        this.hostConn = null;  // Para Slave: conexión con el host
        this.isHost = false;
        this.myId = null;
        this.callbacks = {};
    }

    /**
     * Inicializa el Peer
     * @param {string} id - ID opcional (si no se provee, se genera uno)
     */
    init(id = null) {
        // Generar ID corto si no se provee (para facilitar la entrada)
        // Nota: En producción masiva, esto podría tener colisiones.
        const peerId = id || this.generateShortId();
        
        this.peer = new Peer(peerId, {
            debug: 2
        });
        
        this.peer.on('open', (id) => {
            this.myId = id;
            console.log('Mi Peer ID:', id);
            this.emit('ready', id);
        });
        
        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });
        
        this.peer.on('error', (err) => {
            console.error('Peer error:', err);
            this.emit('error', err);
        });
        
        this.peer.on('disconnected', () => {
            console.log('Desconectado del servidor PeerJS');
            this.emit('disconnected');
        });
    }

    /**
     * Genera un ID corto aleatorio (6 caracteres)
     */
    generateShortId() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    /**
     * Conecta a un Host
     * @param {string} hostId - ID del Host
     */
    connectToHost(hostId) {
        console.log('Conectando a host:', hostId);
        const conn = this.peer.connect(hostId);
        
        conn.on('open', () => {
            console.log('Conexión abierta con Host');
            this.hostConn = conn;
            this.emit('connected', hostId);
            
            // Configurar recepción de datos
            conn.on('data', (data) => {
                this.handleData(data, conn);
            });
        });
        
        conn.on('close', () => {
            console.log('Conexión cerrada por Host');
            this.emit('disconnected');
            this.hostConn = null;
        });
        
        conn.on('error', (err) => {
            console.error('Error de conexión:', err);
            this.emit('error', err);
        });
    }

    /**
     * Maneja una conexión entrante (Solo Host)
     */
    handleConnection(conn) {
        console.log('Nueva conexión entrante:', conn.peer);
        
        conn.on('open', () => {
            this.connections.push(conn);
            this.emit('playerConnected', conn.peer);
            
            conn.on('data', (data) => {
                this.handleData(data, conn);
            });
            
            conn.on('close', () => {
                console.log('Jugador desconectado:', conn.peer);
                this.connections = this.connections.filter(c => c !== conn);
                this.emit('playerDisconnected', conn.peer);
            });
        });
    }

    /**
     * Maneja datos recibidos
     */
    handleData(data, conn) {
        console.log('Datos recibidos:', data);
        if (data && data.type) {
            this.emit(data.type, data.payload, conn.peer);
        }
    }

    /**
     * Envía datos al Host (Solo Slave)
     */
    sendToHost(type, payload = {}) {
        if (this.hostConn && this.hostConn.open) {
            this.hostConn.send({ type, payload });
        } else {
            console.warn('No hay conexión con el Host');
        }
    }

    /**
     * Envía datos a todos los conectados (Solo Host)
     */
    broadcast(type, payload = {}) {
        this.connections.forEach(conn => {
            if (conn.open) {
                conn.send({ type, payload });
            }
        });
    }

    /**
     * Envía datos a un peer específico (Solo Host)
     */
    sendTo(peerId, type, payload = {}) {
        const conn = this.connections.find(c => c.peer === peerId);
        if (conn && conn.open) {
            conn.send({ type, payload });
        }
    }

    /**
     * Registra un callback para un evento
     */
    on(event, callback) {
        if (!this.callbacks[event]) {
            this.callbacks[event] = [];
        }
        this.callbacks[event].push(callback);
    }

    /**
     * Emite un evento
     */
    emit(event, ...args) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(cb => cb(...args));
        }
    }
}

// Exportar instancia global
window.clusterManager = new ClusterManager();