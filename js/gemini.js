/**
 * Módulo de integración con Google Gemini API
 * Genera palabras y pistas para el juego El Impostor
 */

(function() {
    'use strict';

    // Configuración de la API
    const API_CONFIG = {
        BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        TIMEOUT: 10000, // 10 segundos
        MAX_RETRIES: 3
    };

    // Palabras por defecto por categoría (fallback)
    const DEFAULT_WORDS = {
        'animales': ['perro', 'gato', 'elefante', 'león', 'tigre', 'mono', 'delfín', 'águila'],
        'paises': ['México', 'Argentina', 'España', 'Francia', 'Italia', 'Japón', 'Brasil', 'Canadá'],
        'comida': ['pizza', 'hamburguesa', 'tacos', 'sushi', 'pasta', 'helado', 'chocolate', 'café'],
        'colores': ['rojo', 'azul', 'verde', 'amarillo', 'morado', 'naranja', 'rosa', 'negro'],
        'profesiones': ['médico', 'profesor', 'ingeniero', 'artista', 'chef', 'piloto', 'abogado', 'policía'],
        'deportes': ['fútbol', 'baloncesto', 'tenis', 'natación', 'ciclismo', 'boxeo', 'golf', 'voleibol'],
        'música': ['guitarra', 'piano', 'batería', 'violín', 'saxofón', 'trumpeta', 'flauta', 'acordeón'],
        'tecnología': ['smartphone', 'computadora', 'internet', 'robot', 'inteligencia artificial', 'realidad virtual', 'dron', 'satélite']
    };

    // Pistas genéricas para el impostor
    const GENERIC_HINTS = [
        'Es algo que todos conocemos',
        'Se puede encontrar en la naturaleza',
        'Es parte de nuestra vida diaria',
        'Tiene diferentes formas o tipos',
        'Se relaciona con los sentidos',
        'Es importante para la sociedad',
        'Puede ser grande o pequeño',
        'Tiene historia y tradición'
    ];

    /**
     * Clase para interactuar con Google Gemini API
     */
    class GeminiAPI {
        constructor() {
            this.apiKey = null;
            this.retryCount = 0;
        }

        /**
         * Establece la API key
         * @param {string} apiKey - API key de Google Gemini
         */
        setApiKey(apiKey) {
            this.apiKey = apiKey;
        }

        /**
         * Genera una palabra relacionada con el tema
         * @param {string} theme - Tema para la palabra (opcional)
         * @returns {Promise<string>} Palabra generada
         */
        async generateKeyword(theme = null) {
            if (!this.apiKey) {
                throw new Error('API key no configurada');
            }

            try {
                const prompt = this.buildKeywordPrompt(theme);
                const response = await this.callAPI(prompt);
                const keyword = this.extractKeyword(response);
                
                // Sanitizar la palabra
                return this.sanitizeKeyword(keyword);
            } catch (error) {
                console.error('Error al generar palabra:', error);
                
                // Fallback a palabra aleatoria del tema
                return this.getFallbackWord(theme);
            }
        }

        /**
         * Genera una pista para el impostor
         * @param {string} keyword - Palabra clave
         * @param {string} theme - Tema (opcional)
         * @returns {Promise<string>} Pista generada
         */
        async generateHint(keyword, theme = null) {
            if (!this.apiKey) {
                throw new Error('API key no configurada');
            }

            try {
                const prompt = this.buildHintPrompt(keyword, theme);
                const response = await this.callAPI(prompt);
                const hint = this.extractHint(response);
                
                // Sanitizar la pista
                return this.sanitizeHint(hint);
            } catch (error) {
                console.error('Error al generar pista:', error);
                
                // Fallback a pista genérica
                return this.getFallbackHint(keyword, theme);
            }
        }

        /**
         * Construye el prompt para generar una palabra clave
         * @param {string} theme - Tema
         * @returns {string} Prompt formateado
         */
        buildKeywordPrompt(theme) {
            if (theme) {
                return `Genera UNA sola palabra común y conocida relacionada con "${theme}" para un juego de adivinanzas. 
                        La palabra debe ser:
                        - Común y conocida por la mayoría de personas
                        - No demasiado específica ni técnica
                        - Apropiada para un juego familiar
                        
                        Responde SOLO con la palabra, sin explicación ni puntuación adicional.`;
            } else {
                return `Genera UNA sola palabra común y conocida para un juego de adivinanzas. 
                        La palabra debe ser:
                        - Común y conocida por la mayoría de personas
                        - No demasiado específica ni técnica
                        - Apropiada para un juego familiar
                        - De un tema general (animales, objetos, lugares, etc.)
                        
                        Responde SOLO con la palabra, sin explicación ni puntuación adicional.`;
            }
        }

        /**
         * Construye el prompt para generar una pista
         * @param {string} keyword - Palabra clave
         * @param {string} theme - Tema
         * @returns {string} Prompt formateado
         */
        buildHintPrompt(keyword, theme) {
            return `Genera UNA sola pista sutil para ayudar a alguien a adivinar la palabra "${keyword}".
                    La pista debe ser:
                    - Sutil y no demasiado obvia
                    - Útil pero no reveladora
                    - Apropiada para un juego de adivinanzas
                    - En español y máximo 15 palabras
                    
                    Responde SOLO con la pista, sin mencionar la palabra "${keyword}" ni dar explicaciones adicionales.`;
        }

        /**
         * Llama a la API de Google Gemini
         * @param {string} prompt - Prompt para enviar
         * @returns {Promise<Object>} Respuesta de la API
         */
        async callAPI(prompt) {
            const url = `${API_CONFIG.BASE_URL}?key=${this.apiKey}`;
            
            const requestBody = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 1,
                    topP: 1,
                    maxOutputTokens: 100
                }
            };

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                return data;
            } catch (error) {
                clearTimeout(timeoutId);
                
                if (error.name === 'AbortError') {
                    throw new Error('Tiempo de espera agotado');
                }
                
                throw error;
            }
        }

        /**
         * Extrae la palabra clave de la respuesta de la API
         * @param {Object} response - Respuesta de la API
         * @returns {string} Palabra extraída
         */
        extractKeyword(response) {
            try {
                if (response.candidates && response.candidates.length > 0) {
                    const content = response.candidates[0].content;
                    if (content && content.parts && content.parts.length > 0) {
                        const text = content.parts[0].text;
                        // Limpiar el texto: eliminar espacios extra y caracteres especiales
                        return text.trim().replace(/[^\w\sáéíóúÁÉÍÓÚñÑ]/g, '');
                    }
                }
                throw new Error('Respuesta de API inválida');
            } catch (error) {
                console.error('Error al extraer palabra:', error);
                throw error;
            }
        }

        /**
         * Extrae la pista de la respuesta de la API
         * @param {Object} response - Respuesta de la API
         * @returns {string} Pista extraída
         */
        extractHint(response) {
            try {
                if (response.candidates && response.candidates.length > 0) {
                    const content = response.candidates[0].content;
                    if (content && content.parts && content.parts.length > 0) {
                        const text = content.parts[0].text;
                        return text.trim();
                    }
                }
                throw new Error('Respuesta de API inválida');
            } catch (error) {
                console.error('Error al extraer pista:', error);
                throw error;
            }
        }

        /**
         * Sanitiza la palabra clave
         * @param {string} keyword - Palabra a sanitizar
         * @returns {string} Palabra sanitizada
         */
        sanitizeKeyword(keyword) {
            if (!keyword || typeof keyword !== 'string') {
                return 'objeto';
            }

            // Eliminar espacios extra y caracteres especiales
            let sanitized = keyword.trim().toLowerCase();
            
            // Eliminar artículos y preposiciones comunes al inicio
            const prefixes = ['el ', 'la ', 'los ', 'las ', 'un ', 'una ', 'unos ', 'unas '];
            for (let prefix of prefixes) {
                if (sanitized.startsWith(prefix)) {
                    sanitized = sanitized.substring(prefix.length);
                    break;
                }
            }

            // Capitalizar primera letra
            return sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
        }

        /**
         * Sanitiza la pista
         * @param {string} hint - Pista a sanitizar
         * @returns {string} Pista sanitizada
         */
        sanitizeHint(hint) {
            if (!hint || typeof hint !== 'string') {
                return this.getRandomGenericHint();
            }

            // Limpiar el texto
            let sanitized = hint.trim();
            
            // Limitar longitud
            if (sanitized.length > 100) {
                sanitized = sanitized.substring(0, 97) + '...';
            }

            return sanitized;
        }

        /**
         * Obtiene una palabra de respaldo si la API falla
         * @param {string} theme - Tema
         * @returns {string} Palabra de respaldo
         */
        getFallbackWord(theme) {
            if (theme) {
                const themeLower = theme.toLowerCase().trim();
                const words = DEFAULT_WORDS[themeLower] || DEFAULT_WORDS['animales'];
                return words[Math.floor(Math.random() * words.length)];
            } else {
                // Seleccionar una categoría aleatoria
                const categories = Object.keys(DEFAULT_WORDS);
                const randomCategory = categories[Math.floor(Math.random() * categories.length)];
                const words = DEFAULT_WORDS[randomCategory];
                return words[Math.floor(Math.random() * words.length)];
            }
        }

        /**
         * Obtiene una pista de respaldo si la API falla
         * @param {string} keyword - Palabra clave
         * @param {string} theme - Tema
         * @returns {string} Pista de respaldo
         */
        getFallbackHint(keyword, theme) {
            // Intentar generar una pista basada en la palabra y tema
            if (theme) {
                return `Es algo relacionado con ${theme} que todos conocemos`;
            } else {
                return this.getRandomGenericHint();
            }
        }

        /**
         * Obtiene una pista genérica aleatoria
         * @returns {string} Pista genérica
         */
        getRandomGenericHint() {
            return GENERIC_HINTS[Math.floor(Math.random() * GENERIC_HINTS.length)];
        }

        /**
         * Genera tanto la palabra como la pista en una sola llamada
         * @param {string} theme - Tema (opcional)
         * @returns {Promise<Object>} Objeto con palabra y pista
         */
        async generateWordAndHint(theme = null) {
            try {
                const keyword = await this.generateKeyword(theme);
                const hint = await this.generateHint(keyword, theme);
                
                return {
                    keyword: keyword,
                    hint: hint,
                    source: 'api'
                };
            } catch (error) {
                console.error('Error al generar palabra y pista:', error);
                
                // Fallback completo
                const keyword = this.getFallbackWord(theme);
                const hint = this.getFallbackHint(keyword, theme);
                
                return {
                    keyword: keyword,
                    hint: hint,
                    source: 'fallback'
                };
            }
        }

        /**
         * Verifica si la API key es válida haciendo una llamada de prueba
         * @returns {Promise<boolean>} True si es válida, false en caso contrario
         */
        async validateApiKey() {
            if (!this.apiKey) {
                return false;
            }

            try {
                const testPrompt = 'Responde SOLO con la palabra "test"';
                const response = await this.callAPI(testPrompt);
                
                // Si la llamada fue exitosa, la API key es válida
                return true;
            } catch (error) {
                console.error('Error al validar API key:', error);
                return false;
            }
        }
    }

    // Crear instancia global
    window.geminiAPI = new GeminiAPI();

})();