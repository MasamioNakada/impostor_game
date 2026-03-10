/**
 * Cluster Host Logic
 * Handles game state, player management, and communication with slaves
 */

(function() {
    'use strict';

    const DISCONNECT_GRACE_MS = 2 * 60 * 1000;

    // Game State
    const state = {
        apiKey: null,
        impostorCount: 1,
        players: [], // { id, name, token, rejoinCode, role, vote, connected, disconnectedAt }
        gameStatus: 'setup', // setup, lobby, playing, discussion, voting, results
        word: null,
        hint: null,
        impostorIds: [],
        votes: {},
        lastResults: null,
        myRoleData: null
    };

    // DOM Elements
    const elements = {
        setupSection: document.getElementById('setup-section'),
        lobbySection: document.getElementById('lobby-section'),
        gameControls: document.getElementById('game-controls'),
        roomCode: document.getElementById('room-code'),
        playersList: document.getElementById('players-list'),
        playerCount: document.getElementById('player-count'),
        playersListGame: document.getElementById('players-list-game'),
        playerCountGame: document.getElementById('player-count-game'),
        startGameBtn: document.getElementById('start-game-btn'),
        gameStatus: document.getElementById('game-status'),
        hostGameView: document.getElementById('host-game-view'),
        hostRevealPhase: document.getElementById('host-reveal-phase'),
        hostRoleCard: document.getElementById('host-role-card'),
        hostRoleInfo: document.getElementById('host-role-info'),
        hostRoleTitle: document.getElementById('host-role-title'),
        hostSecretWordContainer: document.getElementById('host-secret-word-container'),
        hostSecretWord: document.getElementById('host-secret-word'),
        hostRoleHint: document.getElementById('host-role-hint'),
        hostDiscussionPhase: document.getElementById('host-discussion-phase'),
        hostVotingPhase: document.getElementById('host-voting-phase'),
        hostResultsPhase: document.getElementById('host-results-phase'),
        hostResultsContent: document.getElementById('host-results-content'),
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
        forceEndVotingBtn: document.getElementById('force-end-voting-btn'),
        forceVotingPanel: document.getElementById('force-voting-panel'),
        missingVotesList: document.getElementById('missing-votes-list'),
        finalizeForcedVotingBtn: document.getElementById('finalize-forced-voting-btn'),
        showResultsBtn: document.getElementById('show-results-btn'),
        newGameBtn: document.getElementById('new-game-btn'),
        hostVotingArea: document.getElementById('host-voting-area'),
        hostVotingList: document.getElementById('host-voting-list'),
        hostSubmitVoteBtn: document.getElementById('host-submit-vote-btn'),
        roomQr: document.getElementById('room-qr'),
        roomJoinLink: document.getElementById('room-join-link')
    };

    let roomQrInstance = null;

    // Initialize
    function init() {
        setupEventListeners();
        checkStorage();

        if (window.keepAwake) {
            window.keepAwake.init({ indicatorId: 'keep-awake-indicator' });
        }
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
        elements.forceEndVotingBtn.addEventListener('click', forceEndVoting);
        elements.finalizeForcedVotingBtn.addEventListener('click', finalizeForcedVoting);
        elements.showResultsBtn.addEventListener('click', showResults);
        elements.newGameBtn.addEventListener('click', resetGame);

        if (elements.hostRoleCard) {
            elements.hostRoleCard.addEventListener('click', () => {
                if (!elements.hostRoleInfo) return;
                elements.hostRoleCard.classList.add('hidden');
                elements.hostRoleInfo.classList.remove('hidden');
                renderHostRoleInfo();
            });
        }
        
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
        if (window.keepAwake) {
            window.keepAwake.enable();
        }

        const apiKey = elements.apiKeyInput.value.trim();
        if (apiKey) {
            window.geminiAPI.setApiKey(apiKey);
            window.gameStorage.saveConfig({ apiKey }); // Save for future
        }
        state.apiKey = apiKey;

        // Init Peer
        window.clusterManager.init();
        
        window.clusterManager.on('ready', (id) => {
            elements.roomCode.textContent = id;
            renderRoomQr(id);
            state.gameStatus = 'lobby';
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
            markPlayerDisconnected(peerId);
        });

        // Listen for messages from slaves
        window.clusterManager.on('join', (payload, peerId) => {
            const result = addOrReconnectPlayer(peerId, payload);

            if (!result) {
                window.clusterManager.sendTo(peerId, 'joined', { status: 'in_progress' });
                window.clusterManager.sendTo(peerId, 'needs_rejoin', {
                    message: 'La partida ya inició. Ingresa tu ID de reincorporación.'
                });
                return;
            }

            window.clusterManager.sendTo(peerId, 'joined', { status: 'success' });
            syncRejoiningPlayer(result.id);
        });
        
        window.clusterManager.on('vote', (payload, peerId) => {
            recordVote(peerId, payload.candidateId);
        });
    }

    function renderRoomQr(roomId) {
        if (!elements.roomQr || !elements.roomJoinLink) return;

        const joinUrl = new URL('cluster_join.html', window.location.href);
        joinUrl.searchParams.set('room', roomId);

        elements.roomJoinLink.href = joinUrl.toString();
        elements.roomJoinLink.textContent = joinUrl.toString();

        elements.roomQr.innerHTML = '';
        roomQrInstance = null;

        if (typeof window.QRCode !== 'function') return;

        roomQrInstance = new window.QRCode(elements.roomQr, {
            text: joinUrl.toString(),
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: window.QRCode.CorrectLevel.M
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

    function addPlayer(id, name, token = null, rejoinCode = null) {
        if (state.players.find(p => p.id === id)) return;
        
        state.players.push({ id, name, token, rejoinCode, role: null, vote: null, connected: true, disconnectedAt: null });
        updatePlayerList();
        
        // Notify all clients of new player list
        broadcastPlayerList();
    }

    function addOrReconnectPlayer(newPeerId, payload) {
        const name = payload && typeof payload.name === 'string' ? payload.name.trim() : '';
        const token = payload && typeof payload.token === 'string' ? payload.token.trim() : null;
        const rejoinCode = payload && typeof payload.rejoinCode === 'string' ? payload.rejoinCode.trim() : null;

        let existing = null;
        if (token) {
            existing = state.players.find(p => p.token === token);
        }
        if (!existing && rejoinCode) {
            existing = state.players.find(p => p.rejoinCode === rejoinCode);
        }
        if (!existing) {
            existing = state.players.find(p => p.id === newPeerId);
        }

        if (!existing) {
            if (state.gameStatus !== 'lobby') {
                return null;
            }
            addPlayer(newPeerId, name || 'Jugador', token, rejoinCode);
            return state.players.find(p => p.id === newPeerId) || null;
        }

        const oldPeerId = existing.id;
        existing.connected = true;
        existing.disconnectedAt = null;
        if (token) existing.token = token;
        if (rejoinCode) existing.rejoinCode = rejoinCode;
        if (name) existing.name = name;

        if (oldPeerId !== newPeerId) {
            existing.id = newPeerId;
            replaceIdEverywhere(oldPeerId, newPeerId);
        }

        updatePlayerList();
        broadcastPlayerList();
        return existing;
    }

    function replaceIdEverywhere(oldId, newId) {
        if (!oldId || !newId || oldId === newId) return;

        if (state.impostorIds && state.impostorIds.length) {
            state.impostorIds = state.impostorIds.map(id => (id === oldId ? newId : id));
        }

        if (state.votes && Object.keys(state.votes).length) {
            if (state.votes[oldId] && !state.votes[newId]) {
                state.votes[newId] = state.votes[oldId];
            }
            delete state.votes[oldId];
        }
    }

    function removePlayer(id) {
        state.players = state.players.filter(p => p.id !== id);
        updatePlayerList();
        broadcastPlayerList();
    }

    function markPlayerDisconnected(id) {
        const player = state.players.find(p => p.id === id);
        if (!player) return;

        player.connected = false;
        player.disconnectedAt = Date.now();
        updatePlayerList();
        broadcastPlayerList();

        scheduleDisconnectedCleanup(id);
    }

    function scheduleDisconnectedCleanup(id) {
        const disconnectedAt = state.players.find(p => p.id === id)?.disconnectedAt;
        if (!disconnectedAt) return;

        setTimeout(() => {
            const player = state.players.find(p => p.id === id);
            if (!player) return;
            if (player.connected) return;
            if (player.disconnectedAt !== disconnectedAt) return;

            if (state.gameStatus === 'lobby') {
                removePlayer(id);
            }
        }, DISCONNECT_GRACE_MS);
    }

    function updatePlayerList() {
        if (elements.playersList) elements.playersList.innerHTML = '';
        if (elements.playersListGame) elements.playersListGame.innerHTML = '';
        state.players.forEach(player => {
            const li = document.createElement('li');
            const isHost = player.id === window.clusterManager.myId;
            const offlineSuffix = player.connected ? '' : ' (Desconectado)';

            const nameSpan = document.createElement('span');
            nameSpan.textContent = player.name + (isHost ? ' (Host)' : '') + offlineSuffix;

            const actions = document.createElement('span');
            actions.style.display = 'flex';
            actions.style.alignItems = 'center';
            actions.style.gap = '10px';

            const codeSpan = document.createElement('span');
            codeSpan.className = 'player-code';
            const code = isHost ? 'HOST' : (player.rejoinCode || '------');
            codeSpan.textContent = code;
            actions.appendChild(codeSpan);

            if (!isHost && state.gameStatus === 'lobby') {
                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'remove-player';
                removeBtn.textContent = '×';
                removeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    removePlayer(player.id);
                });
                actions.appendChild(removeBtn);
            }

            li.appendChild(nameSpan);
            li.appendChild(actions);

            if (elements.playersList) {
                elements.playersList.appendChild(li);
            }
            if (elements.playersListGame) {
                const liGame = document.createElement('li');
                const nameSpanGame = document.createElement('span');
                nameSpanGame.textContent = player.name + (isHost ? ' (Host)' : '') + offlineSuffix;

                const actionsGame = document.createElement('span');
                actionsGame.style.display = 'flex';
                actionsGame.style.alignItems = 'center';
                actionsGame.style.gap = '10px';

                const codeSpanGame = document.createElement('span');
                codeSpanGame.className = 'player-code';
                codeSpanGame.textContent = isHost ? 'HOST' : (player.rejoinCode || '------');
                actionsGame.appendChild(codeSpanGame);

                liGame.appendChild(nameSpanGame);
                liGame.appendChild(actionsGame);
                elements.playersListGame.appendChild(liGame);
            }
        });
        if (elements.playerCount) elements.playerCount.textContent = state.players.length;
        if (elements.playerCountGame) elements.playerCountGame.textContent = state.players.length;
        
        // Enable start button if enough players (min 3)
        const connectedPlayers = state.players.filter(p => p.connected).length;
        elements.startGameBtn.disabled = connectedPlayers < 3;
    }

    function removePlayer(playerId) {
        const target = state.players.find(p => p.id === playerId);
        if (!target) return;

        if (state.votes && state.votes[playerId]) {
            delete state.votes[playerId];
        }
        if (state.impostorIds && state.impostorIds.length) {
            state.impostorIds = state.impostorIds.filter(id => id !== playerId);
        }

        window.clusterManager.sendTo(playerId, 'kicked', { reason: 'El host te eliminó de la sala.' });
        const conn = window.clusterManager.connections.find(c => c.peer === playerId);
        if (conn) {
            try {
                conn.close();
            } catch (e) {
            }
        }

        state.players = state.players.filter(p => p.id !== playerId);
        updatePlayerList();
        broadcastPlayerList();
    }

    function broadcastPlayerList() {
        window.clusterManager.broadcast('player_list', { 
            players: state.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })) 
        });
    }

    async function startGame() {
        if (window.keepAwake) {
            window.keepAwake.enable();
        }

        state.gameStatus = 'playing';
        state.lastResults = null;
        showScreen('game');
        updateGameStatus('Generando palabra secreta...');

        showHostPhase('reveal');
        resetHostRoleCard();
        
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
                renderHostRoleInfo();
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
        state.gameStatus = 'discussion';
        updateGameStatus('Fase de Discusión. ¡Interroguen!');
        showHostPhase('discussion');
        window.clusterManager.broadcast('phase_change', { phase: 'discussion' });
        
        elements.startDiscussionBtn.classList.add('hidden');
        elements.startVotingBtn.classList.remove('hidden');
    }

    function startVoting() {
        state.gameStatus = 'voting';
        updateGameStatus('Fase de Votación. ¡Elijan al sospechoso!');
        showHostPhase('voting');
        
        // Reset votes
        state.votes = {};
        state.players.forEach(p => p.vote = null);
        
        window.clusterManager.broadcast('phase_change', { 
            phase: 'voting',
            candidates: state.players.map(p => ({ id: p.id, name: p.name }))
        });
        
        elements.startVotingBtn.classList.add('hidden');
        elements.forceEndVotingBtn.classList.remove('hidden');
        hideForceVotingPanel();
        setupHostVoting();
    }

    function forceEndVoting() {
        const missing = getMissingVoters();
        if (missing.length === 0) {
            elements.forceEndVotingBtn.classList.add('hidden');
            showResults();
            return;
        }

        renderMissingVotesPanel(missing);
        elements.forceVotingPanel.classList.remove('hidden');
    }

    function finalizeForcedVoting() {
        elements.forceEndVotingBtn.classList.add('hidden');
        hideForceVotingPanel();
        showResults();
    }

    function hideForceVotingPanel() {
        if (!elements.forceVotingPanel) return;
        elements.forceVotingPanel.classList.add('hidden');
        if (elements.missingVotesList) {
            elements.missingVotesList.innerHTML = '';
        }
    }

    function getMissingVoters() {
        const connected = state.players.filter(p => p.connected);
        const missing = connected.filter(p => !state.votes[p.id]);
        return missing;
    }

    function renderMissingVotesPanel(missingVoters) {
        if (!elements.missingVotesList) return;

        const candidates = state.players.map(p => ({ id: p.id, name: p.name }));
        elements.missingVotesList.innerHTML = '';

        missingVoters.forEach(voter => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.justifyContent = 'space-between';
            row.style.gap = '12px';
            row.style.marginBottom = '10px';
            row.style.padding = '10px';
            row.style.border = '1px solid rgba(255, 255, 255, 0.08)';
            row.style.borderRadius = '4px';
            row.style.background = 'rgba(0, 0, 0, 0.2)';

            const label = document.createElement('div');
            label.style.flex = '1';
            label.style.color = '#ccc';
            label.textContent = `${voter.name} (${voter.rejoinCode || '------'})`;

            const select = document.createElement('select');
            select.className = 'form-input';
            select.style.width = '160px';
            select.style.margin = '0';

            const empty = document.createElement('option');
            empty.value = '';
            empty.textContent = 'Sin voto';
            select.appendChild(empty);

            candidates.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                select.appendChild(opt);
            });

            select.addEventListener('change', () => {
                const value = select.value;
                if (!value) {
                    delete state.votes[voter.id];
                    return;
                }
                state.votes[voter.id] = value;
            });

            row.appendChild(label);
            row.appendChild(select);
            elements.missingVotesList.appendChild(row);
        });
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
        const expectedVotes = state.players.filter(p => p.connected).length;
        updateGameStatus(`Votación en progreso: ${voteCount}/${expectedVotes}`);
        
        if (expectedVotes > 0 && voteCount >= expectedVotes) {
            elements.showResultsBtn.classList.remove('hidden');
        }
    }

    function showResults() {
        elements.forceEndVotingBtn.classList.add('hidden');
        hideForceVotingPanel();
        state.gameStatus = 'results';
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

        const voteCountsList = state.players
            .map(p => ({ id: p.id, name: p.name, count: voteCounts[p.id] || 0 }))
            .sort((a, b) => b.count - a.count);
        
        const results = {
            winner,
            impostorCaught,
            impostorNames,
            word: state.word,
            mostVoted: state.players.find(p => p.id === mostVotedId)?.name || 'Nadie',
            voteCounts: voteCountsList,
            totalVotes: Object.keys(state.votes).length,
            eligibleVoters: state.players.filter(p => p.connected).length
        };

        state.lastResults = results;

        renderHostResults(results);
        showHostPhase('results');
        
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
        state.lastResults = null;
        state.myRoleData = null;
        if (elements.hostResultsContent) {
            elements.hostResultsContent.innerHTML = '';
        }
        
        showScreen('lobby');
        window.clusterManager.broadcast('reset_game');
        
        elements.newGameBtn.classList.add('hidden');
        elements.startDiscussionBtn.classList.add('hidden');
        elements.startVotingBtn.classList.add('hidden');
        elements.forceEndVotingBtn.classList.add('hidden');
        elements.showResultsBtn.classList.add('hidden');

        showHostPhase(null);
        resetHostRoleCard();
    }

    function syncRejoiningPlayer(peerId) {
        const player = state.players.find(p => p.id === peerId);
        if (!player) return;

        if (player.role) {
            const roleData = {
                role: player.role,
                word: player.role === 'impostor' ? null : state.word,
                hint: player.role === 'impostor' ? state.hint : null
            };
            window.clusterManager.sendTo(peerId, 'role_assigned', roleData);
        }

        if (state.gameStatus === 'discussion') {
            window.clusterManager.sendTo(peerId, 'phase_change', { phase: 'discussion' });
        }

        if (state.gameStatus === 'voting') {
            window.clusterManager.sendTo(peerId, 'phase_change', {
                phase: 'voting',
                candidates: state.players.map(p => ({ id: p.id, name: p.name }))
            });
        }

        if (state.gameStatus === 'results' && state.lastResults) {
            window.clusterManager.sendTo(peerId, 'game_over', state.lastResults);
        }
    }

    function showHostPhase(phase) {
        if (elements.hostRevealPhase) elements.hostRevealPhase.classList.add('hidden');
        if (elements.hostDiscussionPhase) elements.hostDiscussionPhase.classList.add('hidden');
        if (elements.hostVotingPhase) elements.hostVotingPhase.classList.add('hidden');
        if (elements.hostResultsPhase) elements.hostResultsPhase.classList.add('hidden');

        if (phase === 'reveal' && elements.hostRevealPhase) elements.hostRevealPhase.classList.remove('hidden');
        if (phase === 'discussion' && elements.hostDiscussionPhase) elements.hostDiscussionPhase.classList.remove('hidden');
        if (phase === 'voting' && elements.hostVotingPhase) elements.hostVotingPhase.classList.remove('hidden');
        if (phase === 'results' && elements.hostResultsPhase) elements.hostResultsPhase.classList.remove('hidden');
    }

    function resetHostRoleCard() {
        if (!elements.hostRoleCard || !elements.hostRoleInfo) return;
        elements.hostRoleCard.classList.remove('hidden');
        elements.hostRoleInfo.classList.add('hidden');
    }

    function renderHostRoleInfo() {
        if (!state.myRoleData) return;
        if (!elements.hostRoleTitle || !elements.hostRoleHint || !elements.hostSecretWordContainer || !elements.hostSecretWord) return;

        if (state.myRoleData.role === 'impostor') {
            elements.hostRoleTitle.textContent = 'ERES EL IMPOSTOR';
            elements.hostRoleTitle.className = 'role-title impostor-role';
            elements.hostSecretWordContainer.classList.add('hidden');
            const hint = state.myRoleData.hint ? `Pista: ${state.myRoleData.hint}` : 'Pista';
            elements.hostRoleHint.textContent = hint;
            return;
        }

        elements.hostRoleTitle.textContent = 'ERES INOCENTE';
        elements.hostRoleTitle.className = 'role-title';
        elements.hostSecretWordContainer.classList.remove('hidden');
        elements.hostSecretWord.textContent = state.myRoleData.word || '';
        elements.hostRoleHint.textContent = 'Descubre al impostor.';
    }

    function renderHostResults(results) {
        if (!elements.hostResultsContent) return;

        const bars = renderVoteBarsHtml(results);
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
            ${bars}
        `;

        elements.hostResultsContent.innerHTML = html;
    }

    function renderVoteBarsHtml(results) {
        if (!results || !Array.isArray(results.voteCounts) || results.voteCounts.length === 0) {
            return '';
        }

        const max = Math.max(...results.voteCounts.map(v => v.count || 0), 1);
        const rows = results.voteCounts
            .filter(v => (v.count || 0) > 0)
            .slice(0, 8)
            .map(v => {
                const pct = Math.round(((v.count || 0) / max) * 100);
                return `
                    <div class="vote-bar-row">
                        <div class="vote-bar-meta">
                            <div class="vote-bar-name">${v.name}</div>
                            <div class="vote-bar-count">${v.count}</div>
                        </div>
                        <div class="vote-bar-track">
                            <div class="vote-bar-fill" style="width: ${pct}%;"></div>
                        </div>
                    </div>
                `;
            })
            .join('');

        const totalVotes = typeof results.totalVotes === 'number' ? results.totalVotes : null;
        const eligible = typeof results.eligibleVoters === 'number' ? results.eligibleVoters : null;
        const subtitle = (totalVotes !== null && eligible !== null)
            ? `<p class="text-center" style="margin-top: 0.5rem; color: #888;">Votos: ${totalVotes}/${eligible}</p>`
            : '';

        if (!rows) return '';

        return `
            <h3 class="text-center" style="margin-top: 1.25rem;">📊 Votos</h3>
            ${subtitle}
            <div class="vote-bars">${rows}</div>
        `;
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
