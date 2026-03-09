/**
 * Script de gestión de jugadores para el juego El Impostor
 * Maneja el registro dinámico de jugadores y validación
 */

(function() {
    'use strict';

    // Estado de los jugadores
    let playersState = {
        players: [],
        minPlayers: 3,
        maxPlayers: 10
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
     * Inicializa la página de jugadores
     */
    function init() {
        setupEventListeners();
        loadExistingPlayers();
        addAnimations();
        addInitialPlayerFields();
        updateUI();
    }

    /**
     * Configura los event listeners
     */
    function setupEventListeners() {
        const form = document.getElementById('players-form');
        const backButton = document.getElementById('back-btn');
        const addPlayerButton = document.getElementById('add-player');
        const startGameButton = document.getElementById('start-game-btn');

        if (form) {
            form.addEventListener('submit', handleFormSubmit);
        }

        if (backButton) {
            backButton.addEventListener('click', handleBackButton);
            backButton.addEventListener('touchstart', handleBackButton);
        }

        if (addPlayerButton) {
            addPlayerButton.addEventListener('click', handleAddPlayer);
            addPlayerButton.addEventListener('touchstart', handleAddPlayer);
        }

        if (startGameButton) {
            startGameButton.addEventListener('click', handleStartGame);
            startGameButton.addEventListener('touchstart', handleStartGame);
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
     * Carga jugadores existentes si los hay
     */
    function loadExistingPlayers() {
        const gameState = window.gameStorage.getGameState();
        
        if (gameState && gameState.players && gameState.players.length > 0) {
            playersState.players = [...gameState.players];
            console.log('Jugadores existentes cargados:', playersState.players);
        }
    }

    /**
     * Agrega campos iniciales de jugadores
     */
    function addInitialPlayerFields() {
        const playersList = document.getElementById('players-list');
        
        if (!playersList) return;

        // Si hay jugadores existentes, crear campos para ellos
        if (playersState.players.length > 0) {
            playersState.players.forEach((playerName, index) => {
                addPlayerField(playerName, index + 1);
            });
        } else {
            // Agregar campos iniciales (mínimo 3)
            for (let i = 1; i <= playersState.minPlayers; i++) {
                addPlayerField('', i);
            }
        }
    }

    /**
     * Agrega un campo de jugador al formulario
     * @param {string} playerName - Nombre del jugador (opcional)
     * @param {number} playerNumber - Número del jugador
     */
    function addPlayerField(playerName = '', playerNumber) {
        const playersList = document.getElementById('players-list');
        
        if (!playersList) return;

        const playerGroup = document.createElement('div');
        playerGroup.className = 'player-input-group';
        playerGroup.innerHTML = `
            <input 
                type="text" 
                class="player-input" 
                placeholder="Jugador ${playerNumber}" 
                value="${playerName}"
                maxlength="20"
                data-player-index="${playerNumber - 1}"
            >
            <button type="button" class="remove-player" data-player-index="${playerNumber - 1}">×</button>
        `;

        // Agregar event listeners
        const input = playerGroup.querySelector('.player-input');
        const removeButton = playerGroup.querySelector('.remove-player');

        input.addEventListener('input', handlePlayerInput);
        input.addEventListener('keypress', handlePlayerKeyPress);
        removeButton.addEventListener('click', handleRemovePlayer);
        removeButton.addEventListener('touchstart', handleRemovePlayer);

        playersList.appendChild(playerGroup);

        // Enfocar el nuevo campo
        setTimeout(() => {
            input.focus();
        }, 100);

        updateUI();
    }

    /**
     * Maneja el input de un jugador
     * @param {Event} event - Evento del input
     */
    function handlePlayerInput(event) {
        const input = event.target;
        const playerIndex = parseInt(input.dataset.playerIndex);
        const playerName = input.value.trim();

        // Actualizar el estado
        playersState.players[playerIndex] = playerName;

        // Validar longitud
        if (playerName.length > 20) {
            input.value = playerName.substring(0, 20);
            playersState.players[playerIndex] = input.value.trim();
        }

        updateUI();
    }

    /**
     * Maneja el evento keypress en inputs de jugadores
     * @param {Event} event - Evento del teclado
     */
    function handlePlayerKeyPress(event) {
        // Si presiona Enter y hay un campo vacío siguiente, enfocarlo
        if (event.key === 'Enter') {
            const inputs = document.querySelectorAll('.player-input');
            const currentIndex = Array.from(inputs).indexOf(event.target);
            
            // Buscar el siguiente campo vacío
            for (let i = currentIndex + 1; i < inputs.length; i++) {
                if (!inputs[i].value.trim()) {
                    inputs[i].focus();
                    event.preventDefault();
                    return;
                }
            }
            
            // Si no hay campos vacíos, agregar uno nuevo si es posible
            if (playersState.players.length < playersState.maxPlayers) {
                handleAddPlayer(event);
                event.preventDefault();
            }
        }
    }

    /**
     * Maneja el botón de agregar jugador
     * @param {Event} event - Evento del click/touch
     */
    function handleAddPlayer(event) {
        event.preventDefault();
        
        if (playersState.players.length >= playersState.maxPlayers) {
            showNotification(`Máximo ${playersState.maxPlayers} jugadores permitidos`, 'warning');
            return;
        }

        addPlayerField('', playersState.players.length + 1);
    }

    /**
     * Maneja el botón de eliminar jugador
     * @param {Event} event - Evento del click/touch
     */
    function handleRemovePlayer(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const button = event.currentTarget;
        const playerIndex = parseInt(button.dataset.playerIndex);
        
        // No permitir eliminar si hay menos del mínimo
        if (playersState.players.length <= playersState.minPlayers) {
            showNotification(`Mínimo ${playersState.minPlayers} jugadores requeridos`, 'warning');
            return;
        }

        // Eliminar del estado
        playersState.players.splice(playerIndex, 1);
        
        // Re-renderizar todos los campos
        reRenderPlayerFields();
    }

    /**
     * Re-renderiza todos los campos de jugadores
     */
    function reRenderPlayerFields() {
        const playersList = document.getElementById('players-list');
        
        if (!playersList) return;

        // Limpiar lista actual
        playersList.innerHTML = '';

        // Agregar campos actualizados
        playersState.players.forEach((playerName, index) => {
            addPlayerField(playerName, index + 1);
        });

        updateUI();
    }

    /**
     * Maneja el envío del formulario
     * @param {Event} event - Evento del formulario
     */
    function handleFormSubmit(event) {
        event.preventDefault();
        
        if (!validatePlayers()) {
            return;
        }

        const submitButton = event.target.querySelector('button[type="submit"]');
        const originalText = submitButton.innerHTML;
        
        // Deshabilitar botón y mostrar estado de carga
        submitButton.disabled = true;
        submitButton.innerHTML = '<span class="btn-icon loading"></span> Iniciando...';
        
        // Guardar jugadores en el almacenamiento
        const gameState = {
            players: [...playersState.players],
            gameStarted: false
        };
        
        const saved = window.gameStorage.saveGameState(gameState);
        
        if (saved) {
            showSuccess('Jugadores guardados exitosamente');
            
            // Navegar al juego después de un breve delay
            setTimeout(() => {
                navigateToGame();
            }, 1000);
        } else {
            showError('Error al guardar los jugadores. Por favor, intenta nuevamente.');
            submitButton.disabled = false;
            submitButton.innerHTML = originalText;
        }
    }

    /**
     * Valida que los jugadores cumplan los requisitos
     * @returns {boolean}
     */
    function validatePlayers() {
        // Filtrar jugadores con nombres válidos
        const validPlayers = playersState.players.filter(name => name && name.trim().length > 0);
        
        if (validPlayers.length < playersState.minPlayers) {
            showError(`Se requieren al menos ${playersState.minPlayers} jugadores con nombres válidos.`);
            return false;
        }
        
        // Verificar que no haya nombres duplicados
        const uniqueNames = new Set(validPlayers.map(name => name.toLowerCase().trim()));
        if (uniqueNames.size !== validPlayers.length) {
            showError('No pueden haber nombres de jugadores duplicados.');
            return false;
        }
        
        // Actualizar el estado con solo jugadores válidos
        playersState.players = validPlayers;
        
        return true;
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
     * Maneja el botón de iniciar juego
     * @param {Event} event - Evento del click/touch
     */
    function handleStartGame(event) {
        event.preventDefault();
        
        const button = event.currentTarget;
        button.classList.add('button-press');
        
        setTimeout(() => {
            button.classList.remove('button-press');
            
            if (validatePlayers()) {
                const form = document.getElementById('players-form');
                if (form) {
                    form.dispatchEvent(new Event('submit'));
                }
            }
        }, 150);
    }

    /**
     * Actualiza la interfaz de usuario
     */
    function updateUI() {
        updatePlayerCounter();
        updateButtonsState();
    }

    /**
     * Actualiza el contador de jugadores
     */
    function updatePlayerCounter() {
        const playerCount = document.getElementById('player-count');
        const validPlayers = playersState.players.filter(name => name && name.trim().length > 0);
        
        if (playerCount) {
            playerCount.textContent = validPlayers.length;
            
            // Cambiar color según estado
            if (validPlayers.length >= playersState.minPlayers) {
                playerCount.classList.add('text-success');
                playerCount.classList.remove('text-warning', 'text-error');
            } else if (validPlayers.length > 0) {
                playerCount.classList.add('text-warning');
                playerCount.classList.remove('text-success', 'text-error');
            } else {
                playerCount.classList.add('text-error');
                playerCount.classList.remove('text-success', 'text-warning');
            }
        }
    }

    /**
     * Actualiza el estado de los botones
     */
    function updateButtonsState() {
        const addPlayerButton = document.getElementById('add-player');
        const startGameButton = document.getElementById('start-game-btn');
        const validPlayers = playersState.players.filter(name => name && name.trim().length > 0);
        
        if (addPlayerButton) {
            addPlayerButton.disabled = playersState.players.length >= playersState.maxPlayers;
        }
        
        if (startGameButton) {
            startGameButton.disabled = validPlayers.length < playersState.minPlayers;
        }
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
     * Navega a la página del juego
     */
    function navigateToGame() {
        addPageTransition(() => {
            window.location.href = 'game.html';
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
     * Muestra mensaje de error
     * @param {string} message - Mensaje de error
     */
    function showError(message) {
        showNotification(message, 'error');
    }

    /**
     * Muestra mensaje de éxito
     * @param {string} message - Mensaje de éxito
     */
    function showSuccess(message) {
        showNotification(message, 'success');
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