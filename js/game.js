/**
 * Script principal del juego El Impostor
 * Maneja la lógica de revelación de roles y turnos
 */

(function() {
    'use strict';

    // Estado del juego
    let gameState = {
        players: [],
        impostorIndex: -1,
        keyword: '',
        impostorHint: '',
        currentPlayerIndex: 0,
        gameStarted: false,
        allPlayersRevealed: false,
        revealedPlayers: new Set()
    };

    // Estado de la UI
    let uiState = {
        isRevealed: false,
        isGenerating: false
    };

    let touchState = {
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        startTime: 0
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
     * Inicializa el juego
     */
    async function init() {
        setupEventListeners();
        addAnimations();
        
        // Cargar estado del juego
        const loaded = await loadGameState();
        
        if (!loaded) {
            showError('No se pudo cargar el estado del juego');
            setTimeout(() => {
                navigateToPlayers();
            }, 2000);
            return;
        }

        // Si el juego no ha comenzado, generar palabra e impostor
        if (!gameState.gameStarted) {
            await generateGameContent();
        }

        updateUI();
    }

    /**
     * Configura los event listeners
     */
    function setupEventListeners() {
        const revealArea = document.getElementById('reveal-area');
        const nextPlayerButton = document.getElementById('next-player');
        const showResultsButton = document.getElementById('show-results');
        const resetGameButton = document.getElementById('reset-game');
        const endGameFinalButton = document.getElementById('end-game-final');
        const newGameButton = document.getElementById('new-game');
        const closeModalButton = document.getElementById('close-modal');
        const continueDiscussionButton = document.getElementById('continue-discussion');
        const endGameEarlyButton = document.getElementById('end-game-early');

        if (revealArea) {
            revealArea.addEventListener('click', handleRevealClick);
            revealArea.addEventListener('touchstart', onTouchStart, { passive: true });
            revealArea.addEventListener('touchmove', onTouchMove, { passive: true });
            revealArea.addEventListener('touchend', onTouchEnd);
        }

        if (nextPlayerButton) {
            nextPlayerButton.addEventListener('click', handleNextPlayer);
            nextPlayerButton.addEventListener('touchstart', handleNextPlayer);
        }

        if (endGameEarlyButton) {
            endGameEarlyButton.addEventListener('click', handleEndGameEarly);
            endGameEarlyButton.addEventListener('touchstart', handleEndGameEarly);
        }

        if (showResultsButton) {
            showResultsButton.addEventListener('click', handleShowResults);
            showResultsButton.addEventListener('touchstart', handleShowResults);
        }

        if (resetGameButton) {
            resetGameButton.addEventListener('click', handleResetGame);
            resetGameButton.addEventListener('touchstart', handleResetGame);
        }

        if (endGameFinalButton) {
            endGameFinalButton.addEventListener('click', handleFinishGameWithResults);
            endGameFinalButton.addEventListener('touchstart', handleFinishGameWithResults);
        }

        if (newGameButton) {
            newGameButton.addEventListener('click', handleNewGame);
            newGameButton.addEventListener('touchstart', handleNewGame);
        }

        if (closeModalButton) {
            closeModalButton.addEventListener('click', handleCloseModal);
            closeModalButton.addEventListener('touchstart', handleCloseModal);
        }

        if (continueDiscussionButton) {
            continueDiscussionButton.addEventListener('click', handleContinueDiscussion);
            continueDiscussionButton.addEventListener('touchstart', handleContinueDiscussion);
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
     * Carga el estado del juego desde el almacenamiento
     * @returns {Promise<boolean>} True si se cargó exitosamente
     */
    async function loadGameState() {
        try {
            const storedState = window.gameStorage.getGameState();
            const storedConfig = window.gameStorage.getConfig();

            if (!storedState || !storedState.players || storedState.players.length === 0) {
                return false;
            }

            if (!storedConfig) {
                return false;
            }

            // Configurar la API key (puede ser null para modo offline)
            window.geminiAPI.setApiKey(storedConfig.apiKey);

            // Cargar estado
            gameState = {
                players: storedState.players,
                impostorIndex: storedState.impostorIndex !== undefined ? storedState.impostorIndex : -1,
                keyword: storedState.keyword || '',
                impostorHint: storedState.impostorHint || '',
                currentPlayerIndex: storedState.currentPlayerIndex || 0,
                gameStarted: storedState.gameStarted || false,
                allPlayersRevealed: storedState.allPlayersRevealed || false,
                revealedPlayers: new Set(storedState.revealedPlayers || [])
            };

            return true;
        } catch (error) {
            console.error('Error al cargar estado del juego:', error);
            return false;
        }
    }

    /**
     * Genera el contenido del juego (palabra e impostor)
     */
    async function generateGameContent() {
        if (uiState.isGenerating) return;

        uiState.isGenerating = true;
        showLoading('Generando palabra secreta...');

        try {
            const storedConfig = window.gameStorage.getConfig();
            const theme = storedConfig ? storedConfig.theme : null;

            // Generar palabra y pista
            const result = await window.geminiAPI.generateWordAndHint(theme);

            gameState.keyword = result.keyword;
            gameState.impostorHint = result.hint;

            // Seleccionar impostor aleatoriamente
            gameState.impostorIndex = Math.floor(Math.random() * gameState.players.length);
            gameState.gameStarted = true;

            // Guardar estado actualizado
            await saveGameState();

            hideLoading();
            showSuccess(`Palabra generada: ${gameState.keyword}`);

        } catch (error) {
            console.error('Error al generar contenido del juego:', error);
            hideLoading();
            showError('Error al generar la palabra. Usando palabra de respaldo.');

            // Fallback
            await generateFallbackContent();
        }

        uiState.isGenerating = false;
    }

    /**
     * Genera contenido de respaldo si la API falla
     */
    async function generateFallbackContent() {
        const fallbackWords = ['perro', 'gato', 'casa', 'árbol', 'coche', 'playa', 'montaña', 'río'];
        const fallbackHints = [
            'Es algo muy común en nuestra vida diaria',
            'Todos lo conocemos desde pequeños',
            'Es parte de nuestra cultura',
            'Se puede encontrar en muchos lugares',
            'Tiene diferentes formas y tamaños'
        ];

        gameState.keyword = fallbackWords[Math.floor(Math.random() * fallbackWords.length)];
        gameState.impostorHint = fallbackHints[Math.floor(Math.random() * fallbackHints.length)];
        gameState.impostorIndex = Math.floor(Math.random() * gameState.players.length);
        gameState.gameStarted = true;

        await saveGameState();
    }

    /**
     * Guarda el estado del juego
     */
    async function saveGameState() {
        try {
            const stateToSave = {
                ...gameState,
                revealedPlayers: Array.from(gameState.revealedPlayers)
            };

            window.gameStorage.saveGameState(stateToSave);
        } catch (error) {
            console.error('Error al guardar estado del juego:', error);
        }
    }

    /**
     * Maneja el click en el área de revelación
     * @param {Event} event - Evento del click
     */
    function handleRevealClick(event) {
        event.preventDefault();
        handleReveal();
    }

    function onTouchStart(e) {
        const t = e.changedTouches[0];
        touchState.startX = t.clientX;
        touchState.startY = t.clientY;
        touchState.startTime = Date.now();
    }

    function onTouchMove(e) {
        const t = e.changedTouches[0];
        touchState.endX = t.clientX;
        touchState.endY = t.clientY;
    }

    function onTouchEnd(e) {
        const t = e.changedTouches[0];
        touchState.endX = t.clientX || touchState.startX;
        touchState.endY = t.clientY || touchState.startY;
        const dx = touchState.endX - touchState.startX;
        const dy = touchState.endY - touchState.startY;
        const dt = Date.now() - touchState.startTime;
        const isTap = Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300;
        const isSwipeLeft = dx < -60 && Math.abs(dy) < 40;
        if (isTap) {
            handleReveal();
            return;
        }
        if (isSwipeLeft) {
            if (uiState.isRevealed) {
                showError('Cierra la tarjeta para pasar al siguiente jugador');
            } else {
                swipeToNextPlayer();
            }
        }
    }

    /**
     * Maneja la revelación del rol del jugador actual
     */
    function handleReveal() {
        if (gameState.allPlayersRevealed) return;
        if (uiState.isRevealed) {
            hideRevealedContent();
            return;
        }
        gameState.revealedPlayers.add(gameState.currentPlayerIndex);
        showRevealedContent();
        uiState.isRevealed = true;

        // Deshabilitar botón siguiente mientras está revelado
        const nextPlayerButton = document.getElementById('next-player');
        if (nextPlayerButton) {
            nextPlayerButton.disabled = true;
            nextPlayerButton.classList.remove('enhanced-pulse');
        }

        saveGameState();
    }

    function hideRevealedContent() {
        const revealContent = document.getElementById('reveal-content');
        const tapToReveal = document.getElementById('tap-to-reveal');
        const nextPlayerButton = document.getElementById('next-player');
        if (!revealContent || !tapToReveal) return;
        revealContent.classList.remove('reveal-animation');
        revealContent.classList.add('hide-animation');
        setTimeout(() => {
            revealContent.classList.add('hidden');
            revealContent.classList.remove('hide-animation');
            tapToReveal.classList.remove('hidden');
            tapToReveal.style.opacity = '1';
            
            // Habilitar botón y mostrar indicación visual de que se puede avanzar
            if (nextPlayerButton) {
                nextPlayerButton.disabled = false;
                nextPlayerButton.classList.add('enhanced-pulse');
            }
            
            uiState.isRevealed = false;
        }, 300);
    }

    /**
     * Muestra el contenido revelado para el jugador actual
     */
    function showRevealedContent() {
        const revealContent = document.getElementById('reveal-content');
        const tapToReveal = document.getElementById('tap-to-reveal');
        const nextPlayerButton = document.getElementById('next-player');

        if (!revealContent || !tapToReveal) return;

        // Determinar si es el impostor
        const isImpostor = gameState.currentPlayerIndex === gameState.impostorIndex;

        // Construir contenido
        let contentHTML = '';

        if (isImpostor) {
            contentHTML = `
                <div class="role-title">🕵️ ¡Eres el IMPOSTOR!</div>
                <div class="hint">💡 Pista: ${gameState.impostorHint}</div>
                <div class="hint">Tu misión: Descubre qué palabra están pensando los demás</div>
            `;
        } else {
            contentHTML = `
                <div class="role-title">✅ Jugador Normal</div>
                <div class="keyword">🎯 Palabra secreta: ${gameState.keyword}</div>
                <div class="hint">Tu misión: Ayuda a identificar al impostor sin revelar la palabra</div>
            `;
        }

        revealContent.innerHTML = contentHTML;

        // Animar transición
        tapToReveal.style.opacity = '0';
        setTimeout(() => {
            tapToReveal.classList.add('hidden');
            revealContent.classList.remove('hidden');
            revealContent.classList.add('reveal-animation');
        }, 300);

        // Habilitar botón de siguiente jugador
        if (nextPlayerButton) {
            nextPlayerButton.disabled = false;
            // No agregamos enhanced-pulse hasta que se cierre la tarjeta
            // nextPlayerButton.classList.add('enhanced-pulse');
        }
    }

    /**
     * Maneja el botón de siguiente jugador
     * @param {Event} event - Evento del click/touch
     */
    function handleNextPlayer(event) {
        event.preventDefault();

        if (uiState.isRevealed) {
            showError('Cierra la tarjeta para pasar al siguiente jugador');
            return;
        }
        advanceToNextPlayer();
    }

    function advanceToNextPlayer() {
        gameState.currentPlayerIndex++;
        if (gameState.currentPlayerIndex >= gameState.players.length) {
            gameState.allPlayersRevealed = true;
            showGameComplete();
            return;
        }
        uiState.isRevealed = false;
        updateUI();
        saveGameState();
    }

    function swipeToNextPlayer() {
        const revealArea = document.getElementById('reveal-area');
        if (!revealArea) {
            advanceToNextPlayer();
            return;
        }
        revealArea.classList.add('swipe-left-out');
        revealArea.addEventListener('animationend', function handler() {
            revealArea.removeEventListener('animationend', handler);
            revealArea.classList.remove('swipe-left-out');
            advanceToNextPlayer();
            revealArea.classList.add('swipe-left-in');
            setTimeout(() => {
                revealArea.classList.remove('swipe-left-in');
            }, 250);
        });
    }

    /**
     * Maneja el botón de finalizar juego anticipadamente
     * @param {Event} event - Evento del click/touch
     */
    function handleEndGameEarly(event) {
        event.preventDefault();
        
        if (confirm('¿Estás seguro de finalizar el juego ahora? Se revelarán los roles.')) {
            // Marcar todos como revelados
            gameState.allPlayersRevealed = true;
            
            // Mostrar pantalla de completado (que oculta las acciones del juego)
            showGameComplete();
            
            // Mostrar el modal con los resultados inmediatamente
            showResultsModal();
        }
    }

    /**
     * Muestra la pantalla de juego completado
     */
    function showGameComplete() {
        const gameComplete = document.getElementById('game-complete');
        const revealArea = document.getElementById('reveal-area');
        const gameActions = document.querySelector('.game-actions');
        
        // Marcar todos como revelados para evitar cambios de estado
        gameState.allPlayersRevealed = true;
        
        if (gameComplete && revealArea && gameActions) {
            // Ocultar área de juego
            revealArea.classList.add('hidden');
            gameActions.classList.add('hidden');

            // Mostrar pantalla de completado
            gameComplete.classList.remove('hidden');
            gameComplete.classList.add('fade-in');

            // Guardar estado final
            saveGameState();
        }
    }

    /**
     * Maneja el botón de mostrar resultados
     * @param {Event} event - Evento del click/touch
     */
    function handleShowResults(event) {
        event.preventDefault();
        showResultsModal();
    }

    /**
     * Maneja el botón de resetear juego
     * @param {Event} event - Evento del click/touch
     */
    function handleResetGame(event) {
        event.preventDefault();

        if (confirm('¿Estás seguro de que quieres reiniciar el juego? Se perderá el progreso actual.')) {
            resetGame();
        }
    }

    /**
     * Maneja el botón de finalizar juego al completar la partida mostrando resultados
     * @param {Event} event - Evento del click/touch
     */
    function handleFinishGameWithResults(event) {
        event.preventDefault();
        
        // Mostrar el modal con los resultados
        showResultsModal();
    }

    /**
     * Maneja el botón de nuevo juego
     * @param {Event} event - Evento del click/touch
     */
    function handleNewGame(event) {
        event.preventDefault();

        if (confirm('¿Quieres comenzar un nuevo juego con los mismos jugadores?')) {
            // Resetear el juego actual pero mantener jugadores
            gameState.gameStarted = false;
            gameState.currentPlayerIndex = 0;
            gameState.allPlayersRevealed = false;
            gameState.revealedPlayers.clear();
            uiState.isRevealed = false;

            saveGameState();
            
            // Regenerar contenido
            generateGameContent();
            
            // Volver a la pantalla de juego
            location.reload();
        }
    }

    /**
     * Maneja el botón de continuar discusión (dentro del modal)
     * @param {Event} event - Evento del click/touch
     */
    function handleContinueDiscussion(event) {
        event.preventDefault();
        
        // Simplemente cerrar el modal para volver a la pantalla de completado
        hideResultsModal();
    }

    /**
     * Maneja el cierre del modal
     * @param {Event} event - Evento del click/touch
     */
    function handleCloseModal(event) {
        event.preventDefault();
        hideResultsModal();
    }

    /**
     * Muestra el modal de resultados
     */
    function showResultsModal() {
        const modal = document.getElementById('results-modal');
        const resultKeyword = document.getElementById('result-keyword');
        const resultImpostor = document.getElementById('result-impostor');
        const resultHint = document.getElementById('result-hint');

        if (modal && resultKeyword && resultImpostor && resultHint) {
            // Llenar datos
            resultKeyword.textContent = gameState.keyword;
            resultImpostor.textContent = gameState.players[gameState.impostorIndex];
            resultHint.textContent = gameState.impostorHint;

            // Mostrar modal
            modal.classList.remove('hidden');
            modal.classList.add('modal-in');
        }
    }

    /**
     * Oculta el modal de resultados
     */
    function hideResultsModal() {
        const modal = document.getElementById('results-modal');
        
        if (modal) {
            modal.classList.add('modal-out');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('modal-in', 'modal-out');
            }, 300);
        }
    }

    /**
     * Muestra instrucciones de discusión
     */
    function showDiscussionInstructions() {
        const instructions = `
🎮 ¡JUEGO COMPLETADO! 🎮

📋 RESUMEN:
• Palabra secreta: ${gameState.keyword}
• Impostor: ${gameState.players[gameState.impostorIndex]}
• Pista del impostor: ${gameState.impostorHint}

⏰ INSTRUCCIONES PARA LA DISCUSIÓN:

1. Tienen 5-10 minutos para discutir
2. Cada jugador puede hacer preguntas y dar pistas
3. El objetivo es identificar al impostor
4. Al final, votan por quien creen que es el impostor

🏆 CONDICIONES DE VICTORIA:
• Ganan los jugadores normales si identifican al impostor
• Gana el impostor si logra adivinar la palabra

¡Que comience la discusión! 💬
        `;

        alert(instructions);
    }

    /**
     * Resetea el juego completamente
     */
    function resetGame() {
        // Limpiar todo el almacenamiento
        window.gameStorage.clearAll();

        // Navegar a la página de inicio
        navigateToHome();
    }

    /**
     * Actualiza la interfaz de usuario
     */
    function updateUI() {
        updatePlayerInfo();
        updateButtonsState();
        updateProgress();
    }

    /**
     * Actualiza la información del jugador actual
     */
    function updatePlayerInfo() {
        const currentPlayerNumber = document.getElementById('current-player-number');
        const totalPlayers = document.getElementById('total-players');
        const playerName = document.getElementById('player-name');

        if (currentPlayerNumber && totalPlayers && playerName) {
            currentPlayerNumber.textContent = `Jugador ${gameState.currentPlayerIndex + 1}`;
            totalPlayers.textContent = `de ${gameState.players.length}`;
            playerName.textContent = gameState.players[gameState.currentPlayerIndex];
        }
    }

    /**
     * Actualiza el estado de los botones
     */
    function updateButtonsState() {
        const nextPlayerButton = document.getElementById('next-player');
        const showResultsButton = document.getElementById('show-results');

        // Verificar si el jugador actual ya ha sido revelado para habilitar el botón
        if (gameState.revealedPlayers.has(gameState.currentPlayerIndex) && !uiState.isRevealed) {
            nextPlayerButton.disabled = false;
            nextPlayerButton.classList.add('enhanced-pulse');
        } else {
            nextPlayerButton.disabled = true;
            nextPlayerButton.classList.remove('enhanced-pulse');
        }

        if (showResultsButton) {
            showResultsButton.disabled = !gameState.allPlayersRevealed;
            showResultsButton.classList.toggle('hidden', !gameState.allPlayersRevealed);
        }
    }

    /**
     * Actualiza el progreso del juego
     */
    function updateProgress() {
        const currentPlayerNumber = document.getElementById('current-player-number');
        
        if (currentPlayerNumber) {
            const progress = ((gameState.currentPlayerIndex + 1) / gameState.players.length) * 100;
            currentPlayerNumber.style.setProperty('--progress', `${progress}%`);
        }
    }

    /**
     * Muestra indicador de carga
     * @param {string} message - Mensaje de carga
     */
    function showLoading(message) {
        const revealArea = document.getElementById('reveal-area');
        
        if (revealArea) {
            revealArea.innerHTML = `
                <div class="loading-container">
                    <div class="loading"></div>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    /**
     * Oculta indicador de carga
     */
    function hideLoading() {
        const revealArea = document.getElementById('reveal-area');
        
        if (revealArea) {
            // Restaurar contenido original
            revealArea.innerHTML = `
                <div class="reveal-content hidden" id="reveal-content">
                    <!-- El contenido se generará dinámicamente -->
                </div>
                
                <div class="tap-to-reveal" id="tap-to-reveal">
                    <div class="tap-icon">👆</div>
                    <h2 class="tap-title" id="player-name">Nombre del Jugador</h2>
                    <p class="tap-subtitle">Toca la pantalla para revelar tu rol</p>
                    <div class="tap-pulse"></div>
                </div>
            `;
        }
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
     * Agrega animaciones iniciales
     */
    function addAnimations() {
        // Animar entrada de elementos
        const gameHeader = document.querySelector('.game-header');
        if (gameHeader) {
            gameHeader.classList.add('slide-in-down');
        }

        // Animar área de revelación
        const revealArea = document.getElementById('reveal-area');
        if (revealArea) {
            setTimeout(() => {
                revealArea.classList.add('fade-in-scale');
            }, 200);
        }

        // Animar botones de acción
        const gameActions = document.querySelector('.game-actions');
        if (gameActions) {
            setTimeout(() => {
                gameActions.classList.remove('hidden');
                gameActions.classList.add('slide-in-up');
            }, 400);
        }
    }

    // Inicializar cuando el DOM esté listo
    ready(init);

})();
