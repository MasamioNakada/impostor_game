/**
 * Módulo de integración con Google Gemini API
 * Genera palabras y pistas para el juego El Impostor
 */

(function() {
    'use strict';

    // Configuración de la API
    const API_CONFIG = {
        BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent',
        TIMEOUT: 10000, // 10 segundos
        MAX_RETRIES: 3
    };

    const FALLBACK_WORDS_URL = 'data/fallback_words.json';

    /**
     * Clase para interactuar con Google Gemini API
     */
    class GeminiAPI {
        constructor() {
            this.apiKey = null;
            this.retryCount = 0;
            this.fallbackWords = null;
            this.fallbackWordsPromise = null;
        }

        async loadFallbackWords() {
            if (this.fallbackWords) return this.fallbackWords;
            if (this.fallbackWordsPromise) return this.fallbackWordsPromise;

            this.fallbackWordsPromise = fetch(FALLBACK_WORDS_URL)
                .then(r => {
                    if (!r.ok) throw new Error(`No se pudo cargar fallback: ${r.status}`);
                    return r.json();
                })
                .then(data => {
                    if (!Array.isArray(data)) throw new Error('Fallback inválido');
                    const normalized = data
                        .filter(x => x && typeof x.palabra === 'string')
                        .map(x => ({
                            palabra: x.palabra,
                            tema: typeof x.tema === 'string' ? x.tema : '',
                            generic_hint: typeof x.generic_hint === 'string' ? x.generic_hint : ''
                        }));
                    if (normalized.length === 0) throw new Error('Fallback vacío');
                    this.fallbackWords = normalized;
                    return this.fallbackWords;
                })
                .catch(() => {
                    this.fallbackWords = [
                        { palabra: 'Objeto', tema: 'general', generic_hint: 'Es algo que todos conocemos' }
                    ];
                    return this.fallbackWords;
                })
                .finally(() => {
                    this.fallbackWordsPromise = null;
                });

            return this.fallbackWordsPromise;
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
                console.log('Modo offline: usando palabra de respaldo');
                const entry = await this.getFallbackEntry(theme);
                return this.sanitizeKeyword(entry.palabra);
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
                const entry = await this.getFallbackEntry(theme);
                return this.sanitizeKeyword(entry.palabra);
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
                console.log('Modo offline: usando pista de respaldo');
                const entry = await this.getFallbackEntry(theme, keyword);
                return this.sanitizeHint(entry.generic_hint || `Es algo relacionado con ${theme || 'un tema'} que todos conocemos`);
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
                const entry = await this.getFallbackEntry(theme, keyword);
                return this.sanitizeHint(entry.generic_hint || `Es algo relacionado con ${theme || 'un tema'} que todos conocemos`);
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
            return `Genera UNA sola pista MUY sutil (obviedad 3/10) para ayudar a alguien a acercarse a la palabra "${keyword}" sin revelarla.

Reglas estrictas:
- NO uses sinónimos, traducciones, definiciones, ni des la respuesta de forma directa.
- NO describas características físicas obvias, la función principal o el uso típico.
- NO menciones letras, sílabas, rimas, ni pistas tipo "empieza con".
- Usa una asociación indirecta: una situación, contexto, metáfora o consecuencia.
- Máximo 12 palabras.
- En español.

Responde SOLO con la pista.`;
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
                return 'Es algo que todos conocemos';
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
            return 'Objeto';
        }

        /**
         * Obtiene una pista de respaldo si la API falla
         * @param {string} keyword - Palabra clave
         * @param {string} theme - Tema
         * @returns {string} Pista de respaldo
         */
        getFallbackHint(keyword, theme) {
            return 'Es algo que todos conocemos';
        }

        /**
         * Obtiene una pista genérica aleatoria
         * @returns {string} Pista genérica
         */
        async getFallbackEntry(theme = null, keyword = null) {
            const list = await this.loadFallbackWords();
            if (keyword) {
                const match = list.find(x => x.palabra.toLowerCase() === String(keyword).toLowerCase());
                if (match) return match;
            }

            const normalizedTheme = theme ? String(theme).toLowerCase().trim() : null;
            const candidates = normalizedTheme
                ? list.filter(x => String(x.tema || '').toLowerCase().trim() === normalizedTheme)
                : list;

            const pool = candidates.length ? candidates : list;
            return pool[Math.floor(Math.random() * pool.length)];
        }

        /**
         * Genera tanto la palabra como la pista en una sola llamada
         * @param {string} theme - Tema (opcional)
         * @returns {Promise<Object>} Objeto con palabra y pista
         */
        async generateWordAndHint(theme = null) {
            if (!this.apiKey) {
                const entry = await this.getFallbackEntry(theme);
                return {
                    keyword: this.sanitizeKeyword(entry.palabra),
                    hint: this.sanitizeHint(entry.generic_hint),
                    source: 'fallback'
                };
            }

            try {
                const keyword = await this.generateKeyword(theme);
                const hint = await this.generateHint(keyword, theme);

                return {
                    keyword,
                    hint,
                    source: 'api'
                };
            } catch (error) {
                console.error('Error al generar palabra y pista:', error);

                const entry = await this.getFallbackEntry(theme);
                return {
                    keyword: this.sanitizeKeyword(entry.palabra),
                    hint: this.sanitizeHint(entry.generic_hint),
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
                // En modo offline, no validamos la key, pero retornamos true para no bloquear
                return true; 
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
