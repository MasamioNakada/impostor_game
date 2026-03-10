/**
 * Script de configuración para el juego El Impostor
 * Maneja la validación de API key y guardado de configuración
 */

(function() {
    'use strict';

    // Estado de la configuración
    let configState = {
        apiKey: '',
        theme: '',
        showHints: true,
        isValidating: false
    };

    // Verificar que el DOM esté listo
    function ready(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    /**
     * Inicializa la página de configuración
     */
    function init() {
        setupEventListeners();
        loadExistingConfig();
        addAnimations();
        setupFormValidation();
    }

    /**
     * Configura los event listeners
     */
    function setupEventListeners() {
        const form = document.getElementById('config-form');
        const backButton = document.getElementById('back-btn');
        const apiKeyInput = document.getElementById('api-key');
        const themeInput = document.getElementById('theme');
        const showHintsInput = document.getElementById('show-hints');

        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        if (backButton) {
            backButton.addEventListener('click', handleBackButton);
            backButton.addEventListener('touchstart', handleBackButton);
        }

        if (apiKeyInput) {
            apiKeyInput.addEventListener('input', handleApiKeyInput);
            apiKeyInput.addEventListener('blur', validateApiKeyFormat);
        }

        if (themeInput) {
            themeInput.addEventListener('input', handleThemeInput);
        }

        if (showHintsInput) {
            showHintsInput.addEventListener('change', (e) => {
                configState.showHints = Boolean(e.target.checked);
            });
        }

        // Agregar feedback táctil mejorado
        document.querySelectorAll('.btn').forEach(button => {
            button.addEventListener('touchstart', function() {
                this.classList.add('button-press');
            });
            
            button.addEventListener('touchend', function() {
                setTimeout(() => {
                    this.classList.remove('button-press');
                }, 150);
            });
        });
    }

    /**
     * Carga configuración existente si la hay
     */
    function loadExistingConfig() {
        const existingConfig = window.gameStorage.getConfig();
        
        if (existingConfig) {
            const apiKeyInput = document.getElementById('api-key');
            const themeInput = document.getElementById('theme');
            const showHintsInput = document.getElementById('show-hints');
            
            if (apiKeyInput && existingConfig.apiKey) {
                apiKeyInput.value = existingConfig.apiKey;
                configState.apiKey = existingConfig.apiKey;
            }
            
            if (themeInput && existingConfig.theme) {
                themeInput.value = existingConfig.theme;
                configState.theme = existingConfig.theme;
            }

            if (showHintsInput) {
                const showHints = existingConfig.showHints !== false;
                showHintsInput.checked = showHints;
                configState.showHints = showHints;
            }
            
            console.log('Configuración existente cargada');
        }
    }

    /**
     * Configura validación del formulario
     */
    function setupFormValidation() {
        const apiKeyInput = document.getElementById('api-key');
        
        if (apiKeyInput) {
            // Validación en tiempo real
            apiKeyInput.addEventListener('input', function() {
                const value = this.value.trim();
                
                // Validar formato básico de API key de Google
                if (value && !isValidApiKeyFormat(value)) {
                    showError('Formato de API key inválido. Debe comenzar con "AIza" y tener al menos 35 caracteres.');
                } else {
                    hideError();
                }
            });
        }
    }

    /**
     * Maneja el envío del formulario
     * @param {Event} event - Evento del formulario
     */
    function handleFormSubmit(event) {
        event.preventDefault();
        
        if (configState.isValidating) return;
        
        const submitButton = event.target.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        
        // Deshabilitar botón y mostrar estado de carga
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="btn-icon loading"></span> Validando...';
        
        configState.isValidating = true;
        
        // Validar API key
        if (!validateApiKey()) {
            // Si no hay API key, confirmar que se usará el modo offline
            if (!configState.apiKey) {
                // Modo offline permitido
            } else {
                submitButton.disabled = false;
                submitButton.innerHTML = originalText;
                configState.isValidating = false;
                return;
            }
        }
        
        // Guardar configuración
        const config = {
            apiKey: configState.apiKey,
            theme: configState.theme || null,
            showHints: configState.showHints
        };
        
        const saved = window.gameStorage.saveConfig(config);
        
        if (saved) {
            const mode = configState.apiKey ? 'con API' : 'offline';
            showSuccess(`Configuración guardada exitosamente (${mode})`);
            
            // Navegar a la página de jugadores después de un breve delay
            setTimeout(() => {
                navigateToPlayers();
            }, 1000);
        } else {
            showError('Error al guardar la configuración. Por favor, intenta nuevamente.');
            submitButton.disabled = false;
            submitButton.innerHTML = originalText;
            configState.isValidating = false;
        }
    }

    /**
     * Maneja el botón de regresar
     * @param {Event} event - Evento del click/touch
     */
    function handleBackButton(event) {
        event.preventDefault();
        
        const button = event.currentTarget;
        button.classList.add('button-press');
        
        setTimeout(() => {
            button.classList.remove('button-press');
            navigateToHome();
        }, 150);
    }

    /**
     * Maneja el input de API key
     * @param {Event} event - Evento del input
     */
    function handleApiKeyInput(event) {
        configState.apiKey = event.target.value.trim();
        
        // Limpiar error mientras escribe
        if (configState.apiKey.length > 0) {
            hideError();
        }
    }

    /**
     * Maneja el input del tema
     * @param {Event} event - Evento del input
     */
    function handleThemeInput(event) {
        configState.theme = event.target.value.trim();
    }

    /**
     * Valida el formato de la API key
     */
    function validateApiKeyFormat() {
        const apiKey = configState.apiKey;
        
        if (!apiKey) return true; // No validar si está vacío
        
        if (!isValidApiKeyFormat(apiKey)) {
            showError('Formato de API key inválido. Debe comenzar con "AIza" y tener al menos 35 caracteres.');
            return false;
        }
        
        return true;
    }

    /**
     * Valida el formato básico de una API key de Google
     * @param {string} apiKey - API key a validar
     * @returns {boolean}
     */
    function isValidApiKeyFormat(apiKey) {
        // Las API keys de Google típicamente comienzan con "AIza" y tienen 35+ caracteres
        const googleApiKeyPattern = /^AIza[0-9A-Za-z\-_]{32,}$/;
        return googleApiKeyPattern.test(apiKey);
    }

    /**
     * Valida la API key de forma más completa
     * @returns {boolean}
     */
    function validateApiKey() {
        if (!configState.apiKey) {
            // Permitir vacío para modo offline
            return false;
        }
        
        if (!isValidApiKeyFormat(configState.apiKey)) {
            showError('Formato de API key inválido. Por favor, verifica que sea una API key válida de Google Gemini.');
            return false;
        }
        
        // Aquí podríamos agregar una validación real con la API
        // Por ahora, solo validamos el formato
        return true;
    }

    /**
     * Navega a la página de inicio
     */
    function navigateToHome() {
        addPageTransition(() => {
            window.location.href = 'index.html';
        });
    }

    /**
     * Navega a la página de jugadores
     */
    function navigateToPlayers() {
        addPageTransition(() => {
            window.location.href = 'players.html';
        });
    }

    /**
     * Agrega transición de página suave
     * @param {Function} callback - Función a ejecutar después de la transición
     */
    function addPageTransition(callback) {
        document.body.classList.add('page-transition-out');
        
        setTimeout(() => {
            if (callback) callback();
        }, 300);
    }

    /**
     * Muestra mensaje de error
     * @param {string} message - Mensaje de error
     */
    function showError(message) {
        const errorElement = document.getElementById('api-error');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.classList.add('show');
            
            // Agregar animación de shake
            const form = document.getElementById('config-form');
            if (form) {
                form.classList.add('shake');
                setTimeout(() => {
                    form.classList.remove('shake');
                }, 500);
            }
        }
    }

    /**
     * Oculta mensaje de error
     */
    function hideError() {
        const errorElement = document.getElementById('api-error');
        if (errorElement) {
            errorElement.classList.remove('show');
        }
    }

    /**
     * Muestra mensaje de éxito
     * @param {string} message - Mensaje de éxito
     */
    function showSuccess(message) {
        showNotification(message, 'success');
    }

    /**
     * Muestra notificación temporal
     * @param {string} message - Mensaje a mostrar
     * @param {string} type - Tipo de notificación (success, error, warning)
     */
    function showNotification(message, type = 'info') {
        // Crear elemento de notificación
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="notification-icon">${getNotificationIcon(type)}</span>
            <span class="notification-message">${message}</span>
        `;
        
        // Agregar al body
        document.body.appendChild(notification);
        
        // Animar entrada
        setTimeout(() => {
            notification.classList.add('notification-in');
        }, 10);
        
        // Auto-remover después de 3 segundos
        setTimeout(() => {
            notification.classList.add('notification-out');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    /**
     * Obtiene el icono apropiado para la notificación
     * @param {string} type - Tipo de notificación
     * @returns {string}
     */
    function getNotificationIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }

    /**
     * Agrega animaciones iniciales
     */
    function addAnimations() {
        // Animar entrada de elementos
        const pageHeader = document.querySelector('.page-header');
        if (pageHeader) {
            pageHeader.classList.add('slide-in-down');
        }

        // Animar tarjetas con delay
        const cards = document.querySelectorAll('.card');
        cards.forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('slide-in-up');
            }, index * 200 + 200);
        });
    }

    // Inicializar cuando el DOM esté listo
    ready(init);

})();
