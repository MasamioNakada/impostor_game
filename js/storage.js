/**
 * Módulo de almacenamiento para el juego El Impostor
 * Gestiona el acceso a localStorage de forma segura
 */

const STORAGE_KEYS = {
    CONFIG: 'impostor_config',
    GAME_STATE: 'impostor_game_state',
    CURRENT_SESSION: 'impostor_session'
};

/**
 * Clase para gestionar el almacenamiento del juego
 */
class GameStorage {
    constructor() {
        this.isAvailable = this.checkStorageAvailability();
    }

    /**
     * Verifica si localStorage está disponible
     * @returns {boolean}
     */
    checkStorageAvailability() {
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            console.warn('localStorage no está disponible:', e);
            return false;
        }
    }

    /**
     * Guarda configuración del juego
     * @param {Object} config - Configuración del juego
     * @param {string} config.apiKey - API key de Google Gemini
     * @param {string|null} config.theme - Tema opcional
     * @param {number} config.timestamp - Timestamp de guardado
     */
    saveConfig(config) {
        if (!this.isAvailable) return false;
        
        try {
            const configData = {
                apiKey: config.apiKey,
                theme: config.theme || null,
                timestamp: Date.now()
            };
            
            localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(configData));
            return true;
        } catch (e) {
            console.error('Error al guardar configuración:', e);
            return false;
        }
    }

    /**
     * Obtiene configuración guardada
     * @returns {Object|null}
     */
    getConfig() {
        if (!this.isAvailable) return null;
        
        try {
            const configData = localStorage.getItem(STORAGE_KEYS.CONFIG);
            if (!configData) return null;
            
            const config = JSON.parse(configData);
            
            // Verificar si la configuración es reciente (máximo 24 horas)
            const maxAge = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
            // Validamos timestamp solo si existe (para compatibilidad)
            if (config.timestamp && (Date.now() - config.timestamp > maxAge)) {
                this.removeConfig();
                return null;
            }
            
            return config;
        } catch (e) {
            console.error('Error al obtener configuración:', e);
            return null;
        }
    }

    /**
     * Elimina configuración guardada
     * @returns {boolean}
     */
    removeConfig() {
        if (!this.isAvailable) return false;
        
        try {
            localStorage.removeItem(STORAGE_KEYS.CONFIG);
            return true;
        } catch (e) {
            console.error('Error al eliminar configuración:', e);
            return false;
        }
    }

    /**
     * Guarda estado del juego
     * @param {Object} gameState - Estado del juego
     * @param {string[]} gameState.players - Array de nombres de jugadores
     * @param {number} gameState.impostorIndex - Índice del impostor
     * @param {string} gameState.keyword - Palabra clave
     * @param {string} gameState.impostorHint - Pista para el impostor
     * @param {number} gameState.currentPlayerIndex - Jugador actual
     * @param {boolean} gameState.gameStarted - Si el juego ha comenzado
     */
    saveGameState(gameState) {
        if (!this.isAvailable) return false;
        
        try {
            const stateData = {
                ...gameState,
                timestamp: Date.now()
            };
            
            localStorage.setItem(STORAGE_KEYS.GAME_STATE, JSON.stringify(stateData));
            return true;
        } catch (e) {
            console.error('Error al guardar estado del juego:', e);
            return false;
        }
    }

    /**
     * Obtiene estado del juego
     * @returns {Object|null}
     */
    getGameState() {
        if (!this.isAvailable) return null;
        
        try {
            const stateData = localStorage.getItem(STORAGE_KEYS.GAME_STATE);
            if (!stateData) return null;
            
            return JSON.parse(stateData);
        } catch (e) {
            console.error('Error al obtener estado del juego:', e);
            return null;
        }
    }

    /**
     * Elimina estado del juego
     * @returns {boolean}
     */
    removeGameState() {
        if (!this.isAvailable) return false;
        
        try {
            localStorage.removeItem(STORAGE_KEYS.GAME_STATE);
            return true;
        } catch (e) {
            console.error('Error al eliminar estado del juego:', e);
            return false;
        }
    }

    /**
     * Guarda datos de sesión temporal
     * @param {Object} sessionData - Datos de sesión
     */
    saveSessionData(sessionData) {
        if (!this.isAvailable) return false;
        
        try {
            const session = {
                ...sessionData,
                timestamp: Date.now()
            };
            
            localStorage.setItem(STORAGE_KEYS.CURRENT_SESSION, JSON.stringify(session));
            return true;
        } catch (e) {
            console.error('Error al guardar datos de sesión:', e);
            return false;
        }
    }

    /**
     * Obtiene datos de sesión temporal
     * @returns {Object|null}
     */
    getSessionData() {
        if (!this.isAvailable) return null;
        
        try {
            const sessionData = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
            if (!sessionData) return null;
            
            return JSON.parse(sessionData);
        } catch (e) {
            console.error('Error al obtener datos de sesión:', e);
            return null;
        }
    }

    /**
     * Elimina datos de sesión temporal
     * @returns {boolean}
     */
    removeSessionData() {
        if (!this.isAvailable) return false;
        
        try {
            localStorage.removeItem(STORAGE_KEYS.CURRENT_SESSION);
            return true;
        } catch (e) {
            console.error('Error al eliminar datos de sesión:', e);
            return false;
        }
    }

    /**
     * Limpia todo el almacenamiento del juego
     * @returns {boolean}
     */
    clearAll() {
        if (!this.isAvailable) return false;
        
        try {
            Object.values(STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            return true;
        } catch (e) {
            console.error('Error al limpiar almacenamiento:', e);
            return false;
        }
    }

    /**
     * Obtiene estadísticas de uso del almacenamiento
     * @returns {Object}
     */
    getStorageStats() {
        if (!this.isAvailable) {
            return {
                available: false,
                used: 0,
                remaining: 0,
                total: 0
            };
        }

        try {
            const total = 5 * 1024 * 1024; // 5MB aproximadamente
            let used = 0;
            
            // Calcular espacio usado
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    used += localStorage[key].length + key.length;
                }
            }
            
            return {
                available: true,
                used: Math.round(used / 1024), // KB
                remaining: Math.round((total - used) / 1024), // KB
                total: Math.round(total / 1024), // KB
                percentage: Math.round((used / total) * 100)
            };
        } catch (e) {
            console.error('Error al obtener estadísticas:', e);
            return {
                available: false,
                used: 0,
                remaining: 0,
                total: 0
            };
        }
    }
}

// Crear instancia global
window.gameStorage = new GameStorage();