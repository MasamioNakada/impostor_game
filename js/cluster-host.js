/**
 * Cluster Host Logic
 * Handles game state, player management, and communication with slaves
 */

(function() {
    'use strict';

    // Game State
    const state = {
        apiKey: null,
        impostorCount: 1,
        players: [], // { id, name, role, vote }
        gameStatus: 'setup', // setup, lobby, playing, voting, results
        word: null,
        hint: null,
        impostorIds: [],
        votes: {}
    };

    // DOM Elements
    const elements = {
        setupSection: document.getElementById('setup-section'),
        lobbySection: document.getElementById('lobby-section'),
        gameControls: document.getElementById('game-controls'),
        roomCode: document.getElementById('room-code'),
        playersList: document.getElementById('players-list'),
        playerCount: document.getElementById('player-count'),
        startGameBtn: document.getElementById('start-game-btn'),
        gameStatus: document.getElementById('game-status'),
        roleModal: document.getElementById('role-modal'),
        closeRoleModal: document.getElementById('close-role-modal'),
        roleTitle: document.getElementById('role-title'),
        secretWordContainer: document.getElementById('secret-word-container'),
        secretWord: document.getElementById('secret-word'),
        roleHint: document.getElementById('role-hint'),
        impostorSelector: document.getElementById('impostor-selector'),
        apiKeyInput: document.getElementById('api-key'),
        createLobbyBtn: document.getElementById('create-lobby-btn'),
        revealMyRoleBtn: document.getElementById('reveal-my-role-btn'),
        startDiscussionBtn: document.getElementById('start-discussion-btn'),
        startVotingBtn: document.getElementById('start-voting-btn'),
        showResultsBtn: document.getElementById('show-results-btn'),
        newGameBtn: document.getElementById('new-game-btn'),
        hostVotingArea: document.getElementById('host-voting-area'),
        hostVotingList: document.getElementById('host-voting-list'),
        hostSubmitVoteBtn: document.getElementById('host-submit-vote-btn')
    };

    // Initialize
    function init() {
        setupEventListeners();
        checkStorage();
    }
    
    // GunDB
    const gun = Gun(['https://gun-manhattan.herokuapp.com/gun']);

    function setupEventListeners() {
        // Impostor Selector
        elements.impostorSelector.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                elements.impostorSelector.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                state.impostorCount = parseInt(e.target.dataset.count);
            });
        });

        // Create Lobby
        elements.createLobbyBtn.addEventListener('click', createLobby);

        // Start Game
        elements.startGameBtn.addEventListener('click', startGame);

        // Game Controls
        elements.revealMyRoleBtn.addEventListener('click', showMyRole);
        elements.closeRoleModal.addEventListener('click', () => elements.roleModal.classList.add('hidden'));
        elements.startDiscussionBtn.addEventListener('click', startDiscussion);
        elements.startVotingBtn.addEventListener('click', startVoting);
        elements.showResultsBtn.addEventListener('click', showResults);
        elements.newGameBtn.addEventListener('click', resetGame);
        
        document.getElementById('back-btn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    function checkStorage() {
        const config = window.gameStorage.getConfig();
        if (config && config.apiKey) {
            elements.apiKeyInput.value = config.apiKey;
        }
    }

    function createLobby() {
        const apiKey = elements.apiKeyInput.value.trim();
        if (apiKey) {
            window.geminiAPI.setApiKey(apiKey);
            window.gameStorage.saveConfig({ apiKey }); // Save for future
        }
        state.apiKey = apiKey;

        // Init Peer
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        window.clusterManager.init(roomId);
        
        window.clusterManager.on('ready', (id) => {
            elements.roomCode.textContent = id;
            showScreen('lobby');
            
            // Add self as player (Host is always a player)
            addPlayer(id, 'Host (Tú)');
            
            // Broadcast Room Availability via GunDB
            publishRoom(id);
        });

        window.clusterManager.on('playerConnected', (conn) => {
            console.log('Jugador conectado:', conn.peer);
            // Wait for 'join' message with name
        });

        window.clusterManager.on('playerDisconnected', (peerId) => {
            removePlayer(peerId);
        });

        // Listen for messages from slaves
        window.clusterManager.on('join', (payload, peerId) => {
            addPlayer(peerId, payload.name);
            // Confirm join
            window.clusterManager.sendTo(peerId, 'joined', { status: 'success' });
        });
        
        window.clusterManager.on('vote', (payload, peerId) => {
            recordVote(peerId, payload.candidateId);
        });
    }

    function publishRoom(roomId) {
        // Publish room to public GunDB node
        const roomData = {
            id: roomId,
            timestamp: Date.now(),
            status: 'waiting',
            players: 1
        };
        
        // Use a namespace for our game
        gun.get('impostor-game-rooms-v1').get(roomId).put(roomData);
        
        // Keep updating timestamp every minute to show it's active
        setInterval(() => {
            if (state.gameStatus === 'lobby') {
                gun.get('impostor-game-rooms-v1').get(roomId).put({
                    timestamp: Date.now(),
                    players: state.players.length
                });
            }
        }, 30000);
    }

    function addPlayer(id, name) {
        if (state.players.find(p => p.id === id)) return;
        
        state.players.push({ id, name, role: null, vote: null });
        updatePlayerList();
        
        // Notify all clients of new player list
        broadcastPlayerList();
    }

    function removePlayer(id) {
        state.players = state.players.filter(p => p.id !== id);
        updatePlayerList();
        broadcastPlayerList();
    }

    function updatePlayerList() {
        elements.playersList.innerHTML = '';
        state.players.forEach(player => {
            const li = document.createElement('li');
            li.textContent = player.name + (player.id === window.clusterManager.myId ? ' (Host)' : '');
            elements.playersList.appendChild(li);
        });
        elements.playerCount.textContent = state.players.length;
        
        // Enable start button if enough players (min 3)
        elements.startGameBtn.disabled = state.players.length < 3;
    }

    function broadcastPlayerList() {
        window.clusterManager.broadcast('player_list', { 
            players: state.players.map(p => ({ id: p.id, name: p.name })) 
        });
    }

    async function startGame() {
        showScreen('game');
        updateGameStatus('Generando palabra secreta...');
        
        // Generate Word
        try {
            const result = await window.geminiAPI.generateWordAndHint();
            state.word = result.keyword;
            state.hint = result.hint;
            
            assignRoles();
            distributeRoles();
            
            updateGameStatus('Roles asignados. ¡Revisen sus dispositivos!');
            elements.startDiscussionBtn.classList.remove('hidden');
            
        } catch (error) {
            console.error('Error starting game:', error);
            updateGameStatus('Error al generar partida. Intenta de nuevo.');
        }
    }

    function assignRoles() {
        const totalPlayers = state.players.length;
        const impostorCount = Math.min(state.impostorCount, Math.floor(totalPlayers / 2)); // Max half players can be impostors
        
        // Reset roles
        state.players.forEach(p => p.role = 'normal');
        state.impostorIds = [];
        
        // Randomly assign impostors
        const indices = Array.from({length: totalPlayers}, (_, i) => i);
        // Remove host from impostor pool? No, host can be impostor.
        
        // Shuffle
        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        
        // Pick first N as impostors
        for (let i = 0; i < impostorCount; i++) {
            const playerIndex = indices[i];
            state.players[playerIndex].role = 'impostor';
            state.impostorIds.push(state.players[playerIndex].id);
        }
    }

    function distributeRoles() {
        state.players.forEach(player => {
            const roleData = {
                role: player.role,
                word: player.role === 'impostor' ? null : state.word,
                hint: player.role === 'impostor' ? state.hint : null
            };
            
            if (player.id === window.clusterManager.myId) {
                // Host's role
                state.myRoleData = roleData;
            } else {
                // Send to slave
                window.clusterManager.sendTo(player.id, 'role_assigned', roleData);
            }
        });
    }

    function showMyRole() {
        if (!state.myRoleData) return;
        
        const isImpostor = state.myRoleData.role === 'impostor';
        elements.roleTitle.textContent = isImpostor ? 'ERES EL IMPOSTOR' : 'ERES INOCENTE';
        elements.roleTitle.className = 'role-title ' + (isImpostor ? 'impostor-role' : '');
        
        if (isImpostor) {
            elements.secretWordContainer.classList.add('hidden');
            elements.roleHint.textContent = `Pista: ${state.myRoleData.hint}`;
        } else {
            elements.secretWordContainer.classList.remove('hidden');
            elements.secretWord.textContent = state.myRoleData.word;
            elements.roleHint.textContent = 'Tu objetivo es descubrir al impostor.';
        }
        
        elements.roleModal.classList.remove('hidden');
    }

    function startDiscussion() {
        updateGameStatus('Fase de Discusión. ¡Interroguen!');
        window.clusterManager.broadcast('phase_change', { phase: 'discussion' });
        
        elements.startDiscussionBtn.classList.add('hidden');
        elements.startVotingBtn.classList.remove('hidden');
    }

    function startVoting() {
        updateGameStatus('Fase de Votación. ¡Elijan al sospechoso!');
        
        // Reset votes
        state.votes = {};
        state.players.forEach(p => p.vote = null);
        
        window.clusterManager.broadcast('phase_change', { 
            phase: 'voting',
            candidates: state.players.map(p => ({ id: p.id, name: p.name }))
        });
        
        elements.startVotingBtn.classList.add('hidden');
        setupHostVoting();
    }

    function setupHostVoting() {
        elements.hostVotingList.innerHTML = '';
        elements.hostVotingArea.classList.remove('hidden');
        elements.hostSubmitVoteBtn.disabled = true;
        let selectedId = null;

        state.players.forEach(player => {
            const li = document.createElement('li');
            li.style.marginBottom = '10px';
            
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary full-width';
            btn.textContent = player.name;
            btn.style.textAlign = 'left';
            
            btn.addEventListener('click', () => {
                elements.hostVotingList.querySelectorAll('button').forEach(b => {
                    b.classList.remove('active');
                    b.classList.remove('btn-primary');
                    b.classList.add('btn-secondary');
                });
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
                btn.classList.add('active');
                
                selectedId = player.id;
                elements.hostSubmitVoteBtn.disabled = false;
            });
            
            li.appendChild(btn);
            elements.hostVotingList.appendChild(li);
        });

        elements.hostSubmitVoteBtn.onclick = () => {
            if (selectedId) {
                recordVote(window.clusterManager.myId, selectedId);
                elements.hostVotingArea.classList.add('hidden');
                updateGameStatus('Voto registrado. Esperando a los demás...');
            }
        };
    }

    function recordVote(voterId, candidateId) {
        state.votes[voterId] = candidateId;
        
        // Check if all voted
        const voteCount = Object.keys(state.votes).length;
        updateGameStatus(`Votación en progreso: ${voteCount}/${state.players.length}`);
        
        if (voteCount >= state.players.length) {
            elements.showResultsBtn.classList.remove('hidden');
        }
    }

    function showResults() {
        // Tally votes
        const voteCounts = {};
        Object.values(state.votes).forEach(vote => {
            voteCounts[vote] = (voteCounts[vote] || 0) + 1;
        });
        
        // Find most voted
        let maxVotes = 0;
        let mostVotedId = null;
        for (const [id, count] of Object.entries(voteCounts)) {
            if (count > maxVotes) {
                maxVotes = count;
                mostVotedId = id;
            }
        }
        
        // Determine outcome
        const impostorCaught = state.impostorIds.includes(mostVotedId);
        const impostorNames = state.players.filter(p => state.impostorIds.includes(p.id)).map(p => p.name).join(', ');
        const winner = impostorCaught ? 'Inocentes' : 'Impostor(es)';
        
        const results = {
            winner,
            impostorCaught,
            impostorNames,
            word: state.word,
            mostVoted: state.players.find(p => p.id === mostVotedId)?.name || 'Nadie'
        };
        
        window.clusterManager.broadcast('game_over', results);
        
        // Show local results (simple alert for now or status update)
        updateGameStatus(`Juego Terminado. Ganadores: ${winner}. Impostor: ${impostorNames}`);
        
        elements.showResultsBtn.classList.add('hidden');
        elements.newGameBtn.classList.remove('hidden');
    }

    function resetGame() {
        state.gameStatus = 'lobby';
        state.word = null;
        state.votes = {};
        
        showScreen('lobby');
        window.clusterManager.broadcast('reset_game');
        
        elements.newGameBtn.classList.add('hidden');
        elements.startDiscussionBtn.classList.add('hidden');
        elements.startVotingBtn.classList.add('hidden');
        elements.showResultsBtn.classList.add('hidden');
    }

    function updateGameStatus(msg) {
        elements.gameStatus.textContent = msg;
    }

    function showScreen(screenName) {
        elements.setupSection.classList.add('hidden');
        elements.lobbySection.classList.add('hidden');
        elements.gameControls.classList.add('hidden');
        
        if (screenName === 'setup') elements.setupSection.classList.remove('hidden');
        if (screenName === 'lobby') elements.lobbySection.classList.remove('hidden');
        if (screenName === 'game') elements.gameControls.classList.remove('hidden');
    }

    // Run init
    init();

})();