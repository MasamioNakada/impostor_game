/**
 * Script principal para la página de inicio
 * Maneja la navegación y validación inicial
 */

(function() {
    'use strict';

    // Verificar que el DOM esté listo
    function ready(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }

    /**
     * Inicializa la página de inicio
     */
    function init() {
        setupEventListeners();
        addAnimations();
        checkExistingConfig();
    }

    /**
     * Configura los event listeners
     */
    function setupEventListeners() {
        const startButton = document.getElementById('start-game');
        if (startButton) {
            startButton.addEventListener('click', handleStartGame);
            startButton.addEventListener('touchstart', handleStartGame);
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
     * Maneja el inicio del juego
     * @param {Event} event - Evento del click/touch
     */
    function handleStartGame(event) {
        event.preventDefault();
        
        const button = event.currentTarget;
        button.classList.add('button-press');
        
        // Agregar pequeña demora para el feedback visual
        setTimeout(() => {
            button.classList.remove('button-press');
            
            // Verificar si hay configuración existente
            const existingConfig = window.gameStorage.getConfig();
            
            if (existingConfig && existingConfig.apiKey) {
                // Si hay configuración válida, ir directamente a jugadores
                navigateToPlayers();
            } else {
                // Si no hay configuración, ir a configuración
                navigateToConfig();
            }
        }, 150);
    }

    /**
     * Navega a la página de configuración
     */
    function navigateToConfig() {
        addPageTransition(() => {
            window.location.href = 'config.html';
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
     * Verifica si existe configuración previa
     */
    function checkExistingConfig() {
        const existingConfig = window.gameStorage.getConfig();
        const startButton = document.getElementById('start-game');
        
        if (existingConfig && existingConfig.apiKey) {
            // Si hay configuración, cambiar el texto del botón
            if (startButton) {
                const buttonText = startButton.querySelector('.btn-icon');
                if (buttonText) {
                    buttonText.textContent = '▶️';
                }
                startButton.innerHTML = '<span class="btn-icon">▶️</span> Continuar Juego';
            }
            
            console.log('Configuración existente encontrada');
        }
    }

    /**
     * Agrega animaciones iniciales
     */
    function addAnimations() {
        // Animar entrada de elementos
        const heroSection = document.querySelector('.hero-section');
        if (heroSection) {
            heroSection.classList.add('fade-in');
        }

        // Animar tarjetas con delay
        const cards = document.querySelectorAll('.card');
        cards.forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('slide-in-up');
            }, index * 200);
        });

        // Animar botón de acción
        const actionSection = document.querySelector('.action-section');
        if (actionSection) {
            setTimeout(() => {
                actionSection.classList.add('slide-in-up');
            }, 600);
        }
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

    // Inicializar cuando el DOM esté listo
    ready(init);

})();