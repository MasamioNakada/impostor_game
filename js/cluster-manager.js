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
        this._initProvidedId = false;
        this._initAttempts = 0;
        this._lastInitId = null;
    }

    /**
     * Inicializa el Peer
     * @param {string} id - ID opcional (si no se provee, se genera uno)
     */
    init(id = null) {
        this._initProvidedId = typeof id === 'string' && id.trim().length > 0;
        this._initAttempts = 0;

        this.connections = [];
        this.hostConn = null;
        this.myId = null;

        this._initPeer(id);
    }

    _initPeer(id = null) {
        const peerId = this._initProvidedId ? id : this.generateShortId();
        this._lastInitId = peerId;

        if (this.peer) {
            try {
                this.peer.destroy();
            } catch (e) {
            }
        }

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
            if (err && err.type === 'unavailable-id' && !this._initProvidedId && this._initAttempts < 5) {
                this._initAttempts += 1;
                this._initPeer(null);
                return;
            }

            console.error('Peer error:', err);
            this.emit('error', err);
        });

        this.peer.on('disconnected', () => {
            console.log('Desconectado del servidor PeerJS');
            this.emit('disconnected');
        });
    }

    _waitForReady(timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            if (this.myId) {
                resolve(this.myId);
                return;
            }

            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('Timeout esperando Peer open'));
            }, timeoutMs);

            const onReady = (id) => {
                cleanup();
                resolve(id);
            };

            const cleanup = () => {
                clearTimeout(timer);
                const arr = this.callbacks['ready'];
                if (!arr) return;
                this.callbacks['ready'] = arr.filter(cb => cb !== onReady);
            };

            this.on('ready', onReady);
        });
    }

    /**
     * Genera un ID corto aleatorio (4 caracteres)
     */
    generateShortId() {
        return Math.random().toString(36).substring(2, 6).toUpperCase();
    }

    /**
     * Conecta a un Host
     * @param {string} hostId - ID del Host
     */
    connectToHost(hostId) {
        console.log('Conectando a host:', hostId);

        if (!this.peer) {
            this.init(this._lastInitId);
        }

        if (this.peer && this.peer.disconnected && !this.peer.destroyed) {
            try {
                this.peer.reconnect();
            } catch (e) {
            }
        }

        const doConnect = async () => {
            try {
                await this._waitForReady(8000);
            } catch (e) {
                this.emit('error', e);
                return;
            }

            if (!this.peer || this.peer.destroyed) {
                this.emit('error', new Error('Peer no disponible'));
                return;
            }

            if (this.hostConn) {
                try {
                    this.hostConn.close();
                } catch (e) {
                }
                this.hostConn = null;
            }

            const conn = this.peer.connect(hostId);
        
            conn.on('open', () => {
                console.log('Conexión abierta con Host');
                this.hostConn = conn;
                this.emit('connected', hostId);

                conn.on('data', (data) => {
                    this.handleData(data, conn);
                });
            });

            conn.on('close', () => {
                console.log('Conexión cerrada por Host');
                this.emit('disconnected');
                if (this.hostConn === conn) {
                    this.hostConn = null;
                }
            });

            conn.on('error', (err) => {
                console.error('Error de conexión:', err);
                this.emit('error', err);
            });
        };

        doConnect();
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
