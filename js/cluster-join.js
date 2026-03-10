/**
 * Cluster Join Logic
 * Handles slave connection, game UI updates, and interaction
 */

(function() {
    'use strict';

    // State
    const state = {
        hostId: null,
        myName: null,
        myId: null,
        role: null,
        word: null,
        hint: null,
        players: [], // List of all players
        vote: null
    };

    // DOM Elements
    const elements = {
        joinSection: document.getElementById('join-section'),
        lobbySection: document.getElementById('lobby-section'),
        gameSection: document.getElementById('game-section'),
        roomCodeInput: document.getElementById('room-code-input'),
        playerNameInput: document.getElementById('player-name-input'),
        joinBtn: document.getElementById('join-btn'),
        joinStatus: document.getElementById('join-status'),
        myNameDisplay: document.getElementById('my-name-display'),
        revealPhase: document.getElementById('reveal-phase'),
        discussionPhase: document.getElementById('discussion-phase'),
        votingPhase: document.getElementById('voting-phase'),
        resultsPhase: document.getElementById('results-phase'),
        roleCard: document.getElementById('role-card'),
        roleInfo: document.getElementById('role-info'),
        roleTitle: document.getElementById('role-title'),
        secretWordContainer: document.getElementById('secret-word-container'),
        secretWord: document.getElementById('secret-word'),
        roleHint: document.getElementById('role-hint'),
        votingList: document.getElementById('voting-list'),
        submitVoteBtn: document.getElementById('submit-vote-btn'),
        resultsContent: document.getElementById('results-content')
    };
// Initialize
    function init() {
        setupEventListeners();
        window.clusterManager.init(); // Init with random ID
        listenForRooms();
        
        window.clusterManager.on('ready', (id) => {
            state.myId = id;
            console.log('My ID:', id);
        });

        window.clusterManager.on('connected', (hostId) => {
            state.hostId = hostId;
            showScreen('lobby');
            updateStatus('Conectado. Esperando confirmación...');
            
            // Send join request
            window.clusterManager.sendToHost('join', { name: state.myName });
        });

        window.clusterManager.on('disconnected', () => {
            alert('Desconectado del host');
            showScreen('join');
        });

        window.clusterManager.on('joined', (payload) => {
            if (payload.status === 'success') {
                updateStatus('¡Unido exitosamente!');
            }
        });

        window.clusterManager.on('role_assigned', (payload) => {
            state.role = payload.role;
            state.word = payload.word;
            state.hint = payload.hint;
            
            showScreen('game');
            showPhase('reveal');
            resetRoleCard();
        });

        window.clusterManager.on('phase_change', (payload) => {
            if (payload.phase === 'discussion') {
                showPhase('discussion');
            } else if (payload.phase === 'voting') {
                setupVoting(payload.candidates);
                showPhase('voting');
            }
        });

        window.clusterManager.on('game_over', (payload) => {
            showResults(payload);
            showPhase('results');
        });

        window.clusterManager.on('reset_game', () => {
            showScreen('lobby');
            state.role = null;
            state.word = null;
        });
    }

    // GunDB
    const roomsList = document.getElementById('rooms-list');
    const noRoomsMsg = document.getElementById('no-rooms-msg');
    
    // GunDB
    const gun = Gun(['https://gun-manhattan.herokuapp.com/gun']);

    function listenForRooms() {
        const foundRooms = new Set();
        
        // Listen to public room list
        gun.get('impostor-game-rooms-v1').map().on((room, roomId) => {
            if (!room || !room.id) return;
            
            // Filter old rooms (older than 30 mins)
            const now = Date.now();
            if (now - room.timestamp > 30 * 60 * 1000) return;
            
            if (!foundRooms.has(room.id)) {
                foundRooms.add(room.id);
                noRoomsMsg.classList.add('hidden');
                addRoomToList(room);
            } else {
                updateRoomInList(room);
            }
        });
    }

    function addRoomToList(room) {
        const li = document.createElement('li');
        li.id = `room-${room.id}`;
        li.className = 'room-item';
        li.innerHTML = `
            <div class="room-info">
                <span class="room-name">Sala ${room.id}</span>
                <span class="room-details">Jugadores: ${room.players || 1} | Estado: ${room.status === 'waiting' ? 'Esperando' : 'En Juego'}</span>
            </div>
            <button class="btn btn-secondary join-room-btn" data-id="${room.id}">Unirse</button>
        `;
        
        li.querySelector('.join-room-btn').addEventListener('click', () => {
            elements.roomCodeInput.value = room.id;
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
            // Focus name input
            elements.playerNameInput.focus();
        });
        
        roomsList.appendChild(li);
    }

    function updateRoomInList(room) {
        const li = document.getElementById(`room-${room.id}`);
        if (li) {
            li.querySelector('.room-details').textContent = `Jugadores: ${room.players || 1} | Estado: ${room.status === 'waiting' ? 'Esperando' : 'En Juego'}`;
        }
    }

    function setupEventListeners() {
        elements.joinBtn.addEventListener('click', handleJoin);
        
        elements.roleCard.addEventListener('click', () => {
            elements.roleCard.classList.add('hidden');
            elements.roleInfo.classList.remove('hidden');
            
            // Populate role info
            if (state.role === 'impostor') {
                elements.roleTitle.textContent = 'ERES EL IMPOSTOR';
                elements.roleTitle.className = 'role-title impostor-role';
                elements.secretWordContainer.classList.add('hidden');
                elements.roleHint.textContent = `Pista: ${state.hint}`;
            } else {
                elements.roleTitle.textContent = 'ERES INOCENTE';
                elements.roleTitle.className = 'role-title';
                elements.secretWordContainer.classList.remove('hidden');
                elements.secretWord.textContent = state.word;
                elements.roleHint.textContent = 'Descubre al impostor.';
            }
        });
        
        elements.submitVoteBtn.addEventListener('click', submitVote);
        
        document.getElementById('back-btn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    function handleJoin() {
        const roomCode = elements.roomCodeInput.value.trim().toUpperCase();
        const name = elements.playerNameInput.value.trim();
        
        if (!roomCode || !name) {
            elements.joinStatus.textContent = 'Ingresa código y nombre';
            elements.joinStatus.classList.remove('hidden');
            return;
        }
        
        state.myName = name;
        elements.myNameDisplay.textContent = name;
        elements.joinStatus.textContent = 'Conectando...';
        elements.joinStatus.classList.remove('hidden');
        elements.joinBtn.disabled = true;
        
        window.clusterManager.connectToHost(roomCode);
    }

    function resetRoleCard() {
        elements.roleCard.classList.remove('hidden');
        elements.roleInfo.classList.add('hidden');
    }

    function setupVoting(candidates) {
        elements.votingList.innerHTML = '';
        state.vote = null;
        elements.submitVoteBtn.disabled = true;
        
        candidates.forEach(candidate => {
            // Don't vote for self? usually allowed in impostor games to bluff
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.className = 'vote-btn';
            btn.textContent = candidate.name;
            btn.dataset.id = candidate.id;
            
            btn.addEventListener('click', () => {
                // Select this candidate
                elements.votingList.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                state.vote = candidate.id;
                elements.submitVoteBtn.disabled = false;
            });
            
            li.appendChild(btn);
            elements.votingList.appendChild(li);
        });
    }

    function submitVote() {
        if (state.vote) {
            window.clusterManager.sendToHost('vote', { candidateId: state.vote });
            elements.submitVoteBtn.textContent = 'VOTO ENVIADO';
            elements.submitVoteBtn.disabled = true;
            elements.votingList.classList.add('hidden'); // Hide list after voting
        }
    }

    function showResults(results) {
        const html = `
            <div class="result-item">
                <span class="result-label">Ganador</span>
                <span class="result-value ${results.impostorCaught ? 'text-success' : 'text-error'}">${results.winner}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Impostor</span>
                <span class="result-value" style="color: var(--neon-red)">${results.impostorNames}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Palabra</span>
                <span class="result-value" style="color: var(--neon-green)">${results.word}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Más Votado</span>
                <span class="result-value">${results.mostVoted}</span>
            </div>
        `;
        elements.resultsContent.innerHTML = html;
    }

    function showScreen(screen) {
        elements.joinSection.classList.add('hidden');
        elements.lobbySection.classList.add('hidden');
        elements.gameSection.classList.add('hidden');
        
        if (screen === 'join') elements.joinSection.classList.remove('hidden');
        if (screen === 'lobby') elements.lobbySection.classList.remove('hidden');
        if (screen === 'game') elements.gameSection.classList.remove('hidden');
    }

    function showPhase(phase) {
        elements.revealPhase.classList.add('hidden');
        elements.discussionPhase.classList.add('hidden');
        elements.votingPhase.classList.add('hidden');
        elements.resultsPhase.classList.add('hidden');
        
        if (phase === 'reveal') elements.revealPhase.classList.remove('hidden');
        if (phase === 'discussion') elements.discussionPhase.classList.remove('hidden');
        if (phase === 'voting') elements.votingPhase.classList.remove('hidden');
        if (phase === 'results') elements.resultsPhase.classList.remove('hidden');
    }

    function updateStatus(msg) {
        // Optional: toast or status bar
        console.log(msg);
    }

    init();

})();