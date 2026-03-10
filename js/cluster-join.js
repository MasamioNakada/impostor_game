/**
 * Cluster Join Logic
 * Handles slave connection, game UI updates, and interaction
 */

(function() {
    'use strict';

    const ROOM_CODE_LENGTH = 4;
    const STORAGE_KEYS = {
        playerName: 'impostor.playerName',
        lastRoom: 'impostor.lastRoom',
        peerId: 'impostor.peerId',
        playerToken: 'impostor.playerToken',
        rejoinCode: 'impostor.rejoinCode'
    };

    const PROGRESS_PREFIX = 'impostor.progress.';

    const PEER_ID_LENGTH = 8;
    const PEER_ID_PREFIX = 'S';

    const REJOIN_CODE_LENGTH = 6;

    // State
    const state = {
        hostId: null,
        myName: null,
        myId: null,
        role: null,
        word: null,
        hint: null,
        showHints: true,
        players: [], // List of all players
        vote: null,
        reconnectTimer: null,
        reconnectAttempts: 0,
        phase: null
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
        resultsContent: document.getElementById('results-content'),
        rejoinCodeDisplay: document.getElementById('rejoin-code-display'),
        manualRejoin: document.getElementById('manual-rejoin'),
        rejoinCodeInput: document.getElementById('rejoin-code-input'),
        rejoinBtn: document.getElementById('rejoin-btn'),
        rejoinStatus: document.getElementById('rejoin-status')
    };
// Initialize
    function init() {
        setupEventListeners();

        if (window.keepAwake) {
            window.keepAwake.init({ indicatorId: 'keep-awake-indicator' });
        }

        window.clusterManager.on('ready', (id) => {
            state.myId = id;
            console.log('My ID:', id);
            persistPeerId(id);
        });

        window.clusterManager.on('error', (err) => {
            if (err && err.type === 'unavailable-id') {
                const newPeerId = regeneratePeerId();
                window.clusterManager.init(newPeerId);
            }
        });

        const desiredPeerId = getOrCreatePeerId();
        window.clusterManager.init(desiredPeerId);
        listenForRooms();

        loadSavedJoinInfo();
        prefillRoomCodeFromUrl();
        maybeAutoJoin();

        updateRejoinCodeUi();

        window.addEventListener('online', () => attemptReconnect('online'));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) attemptReconnect('visible');
        });
        
        window.clusterManager.on('connected', (hostId) => {
            state.hostId = hostId;
            state.reconnectAttempts = 0;
            if (state.reconnectTimer) {
                clearTimeout(state.reconnectTimer);
                state.reconnectTimer = null;
            }
            showScreen('lobby');
            updateStatus('Conectado. Esperando confirmación...');

            if (window.keepAwake) {
                window.keepAwake.enable();
            }
            
            // Send join request
            window.clusterManager.sendToHost('join', {
                name: state.myName,
                token: getOrCreatePlayerToken(),
                rejoinCode: getOrCreateRejoinCode()
            });

            scheduleManualRejoinHint();
        });

        window.clusterManager.on('disconnected', () => {
            elements.joinStatus.textContent = 'Se perdió la conexión. Puedes volver a unirte.';
            elements.joinStatus.classList.remove('hidden');
            elements.joinBtn.disabled = false;
            showScreen('join');

            scheduleReconnect();
        });

        window.clusterManager.on('error', (err) => {
            if (state.hostId) {
                scheduleReconnect();
                return;
            }

            const msg = err && err.type ? `Error: ${err.type}` : 'Error de conexión';
            elements.joinStatus.textContent = msg;
            elements.joinStatus.classList.remove('hidden');
            elements.joinBtn.disabled = false;
        });

        window.clusterManager.on('joined', (payload) => {
            if (payload.status === 'success') {
                updateStatus('¡Unido exitosamente!');
            }
        });

        window.clusterManager.on('needs_rejoin', (payload) => {
            showManualRejoin(payload && payload.message ? payload.message : null);
        });

        window.clusterManager.on('kicked', (payload) => {
            const msg = payload && payload.reason ? payload.reason : 'Fuiste eliminado de la sala.';
            elements.joinStatus.textContent = msg;
            elements.joinStatus.classList.remove('hidden');
            elements.joinBtn.disabled = false;
            showScreen('join');
            state.hostId = null;
        });

        window.clusterManager.on('role_assigned', (payload) => {
            state.role = payload.role;
            state.word = payload.word;
            state.hint = payload.hint;
            
            showScreen('game');
            showPhase('reveal');
            renderRoleInfo();

            const progress = loadProgress(getRoomCodeForProgress());
            if (progress.revealed) {
                showRoleInfo();
            } else {
                resetRoleCard();
            }
        });

        window.clusterManager.on('settings', (payload) => {
            if (!payload) return;
            state.showHints = payload.showHints !== false;
        });

        window.clusterManager.on('phase_change', (payload) => {
            if (payload.phase === 'discussion') {
                showPhase('discussion');
            } else if (payload.phase === 'voting') {
                handleVotingPhase(payload.candidates);
                showPhase('voting');
            }
        });

        window.clusterManager.on('game_over', (payload) => {
            showResults(payload);
            showPhase('results');
            clearProgress(getRoomCodeForProgress());
        });

        window.clusterManager.on('reset_game', () => {
            showScreen('lobby');
            state.role = null;
            state.word = null;
            clearProgress(getRoomCodeForProgress());
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

        elements.roomCodeInput.addEventListener('input', () => {
            const normalized = normalizeRoomCode(elements.roomCodeInput.value);
            if (elements.roomCodeInput.value !== normalized) {
                elements.roomCodeInput.value = normalized;
            }
        });

        if (elements.rejoinCodeInput) {
            elements.rejoinCodeInput.addEventListener('input', () => {
                const normalized = normalizeRejoinCode(elements.rejoinCodeInput.value);
                if (elements.rejoinCodeInput.value !== normalized) {
                    elements.rejoinCodeInput.value = normalized;
                }
            });
        }

        if (elements.rejoinBtn) {
            elements.rejoinBtn.addEventListener('click', handleManualRejoin);
        }
        
        elements.roleCard.addEventListener('click', () => {
            const roomCode = getRoomCodeForProgress();
            saveProgress(roomCode, { revealed: true });
            showRoleInfo();
        });
        
        elements.submitVoteBtn.addEventListener('click', submitVote);
        
        document.getElementById('back-btn').addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }

    function handleJoin() {
        const roomCode = normalizeRoomCode(elements.roomCodeInput.value);
        const name = elements.playerNameInput.value.trim();
        
        if (!roomCode || !name) {
            elements.joinStatus.textContent = 'Ingresa código y nombre';
            elements.joinStatus.classList.remove('hidden');
            return;
        }

        if (roomCode.length !== ROOM_CODE_LENGTH) {
            elements.joinStatus.textContent = `El código debe tener ${ROOM_CODE_LENGTH} caracteres`;
            elements.joinStatus.classList.remove('hidden');
            return;
        }
        
        state.myName = name;
        saveJoinInfo({ name, roomCode });
        updateRejoinCodeUi();
        elements.myNameDisplay.textContent = name;
        elements.joinStatus.textContent = 'Conectando...';
        elements.joinStatus.classList.remove('hidden');
        elements.joinBtn.disabled = true;

        if (window.keepAwake) {
            window.keepAwake.enable();
        }
        
        window.clusterManager.connectToHost(roomCode);
    }

    function handleManualRejoin() {
        const roomCode = normalizeRoomCode(elements.roomCodeInput.value || localStorage.getItem(STORAGE_KEYS.lastRoom) || '');
        const name = (elements.playerNameInput.value || localStorage.getItem(STORAGE_KEYS.playerName) || '').trim();
        const code = normalizeRejoinCode(elements.rejoinCodeInput ? elements.rejoinCodeInput.value : '');

        if (!roomCode || roomCode.length !== ROOM_CODE_LENGTH) {
            setRejoinStatus('Falta el código de sala');
            return;
        }
        if (!name) {
            setRejoinStatus('Falta tu nombre');
            return;
        }
        if (!code || code.length !== REJOIN_CODE_LENGTH) {
            setRejoinStatus(`El ID debe tener ${REJOIN_CODE_LENGTH} caracteres`);
            return;
        }

        try {
            localStorage.setItem(STORAGE_KEYS.rejoinCode, code);
        } catch (e) {
        }

        state.myName = name;
        elements.myNameDisplay.textContent = name;
        elements.joinStatus.textContent = 'Reincorporando...';
        elements.joinStatus.classList.remove('hidden');

        window.clusterManager.sendToHost('join', {
            name: state.myName,
            token: getOrCreatePlayerToken(),
            rejoinCode: code
        });
    }

    function setRejoinStatus(msg) {
        if (!elements.rejoinStatus) return;
        elements.rejoinStatus.textContent = msg;
        elements.rejoinStatus.classList.remove('hidden');
    }

    function showManualRejoin(message) {
        if (!elements.manualRejoin) return;
        elements.manualRejoin.classList.remove('hidden');
        if (elements.rejoinStatus) {
            if (message) {
                elements.rejoinStatus.textContent = message;
                elements.rejoinStatus.classList.remove('hidden');
            } else {
                elements.rejoinStatus.classList.add('hidden');
            }
        }
    }

    function scheduleManualRejoinHint() {
        if (!elements.manualRejoin) return;
        setTimeout(() => {
            if (state.role) return;
            if (!document.hidden) {
                showManualRejoin('Si la partida ya inició, usa tu ID para reincorporarte.');
            }
        }, 7000);
    }

    function getOrCreatePlayerToken() {
        const saved = (localStorage.getItem(STORAGE_KEYS.playerToken) || '').trim();
        if (saved) return saved;

        const created = generateToken();
        try {
            localStorage.setItem(STORAGE_KEYS.playerToken, created);
        } catch (e) {
        }
        return created;
    }

    function getOrCreateRejoinCode() {
        const saved = normalizeRejoinCode(localStorage.getItem(STORAGE_KEYS.rejoinCode) || '');
        if (saved.length === REJOIN_CODE_LENGTH) return saved;

        const created = Math.random().toString(36).substring(2, 2 + REJOIN_CODE_LENGTH).toUpperCase();
        try {
            localStorage.setItem(STORAGE_KEYS.rejoinCode, created);
        } catch (e) {
        }
        return created;
    }

    function normalizeRejoinCode(value) {
        const upper = (value || '').toUpperCase();
        const alnumOnly = upper.replace(/[^A-Z0-9]/g, '');
        return alnumOnly.slice(0, REJOIN_CODE_LENGTH);
    }

    function updateRejoinCodeUi() {
        if (!elements.rejoinCodeDisplay) return;
        elements.rejoinCodeDisplay.textContent = getOrCreateRejoinCode();
    }

    function generateToken() {
        const a = Math.random().toString(36).substring(2, 10);
        const b = Math.random().toString(36).substring(2, 10);
        return (a + b).toUpperCase();
    }

    function scheduleReconnect() {
        if (!state.myName) {
            const savedName = (localStorage.getItem(STORAGE_KEYS.playerName) || '').trim();
            if (savedName) state.myName = savedName;
        }

        const roomCode = normalizeRoomCode(elements.roomCodeInput.value || localStorage.getItem(STORAGE_KEYS.lastRoom) || '');
        if (!roomCode || roomCode.length !== ROOM_CODE_LENGTH) return;

        if (state.reconnectAttempts >= 5) return;

        const delays = [1000, 2000, 4000, 8000, 16000];
        const delay = delays[state.reconnectAttempts] || 16000;
        state.reconnectAttempts += 1;

        if (state.reconnectTimer) {
            clearTimeout(state.reconnectTimer);
        }

        state.reconnectTimer = setTimeout(() => {
            elements.roomCodeInput.value = roomCode;
            if (!elements.playerNameInput.value && state.myName) {
                elements.playerNameInput.value = state.myName;
            }
            elements.joinBtn.disabled = false;
            handleJoin();
        }, delay);
    }

    function attemptReconnect(reason) {
        if (elements.joinBtn.disabled) return;
        if (state.hostId) return;

        const roomCode = normalizeRoomCode(elements.roomCodeInput.value || localStorage.getItem(STORAGE_KEYS.lastRoom) || '');
        const name = (elements.playerNameInput.value || localStorage.getItem(STORAGE_KEYS.playerName) || '').trim();
        if (!roomCode || roomCode.length !== ROOM_CODE_LENGTH) return;
        if (!name) return;

        elements.joinStatus.textContent = reason === 'online' ? 'Reconectando…' : 'Reintentando conexión…';
        elements.joinStatus.classList.remove('hidden');
        handleJoin();
    }

    function normalizeRoomCode(value) {
        const upper = (value || '').toUpperCase();
        const alnumOnly = upper.replace(/[^A-Z0-9]/g, '');
        return alnumOnly.slice(0, ROOM_CODE_LENGTH);
    }

    function prefillRoomCodeFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (!room) return;

        const normalized = normalizeRoomCode(room);
        if (normalized.length !== ROOM_CODE_LENGTH) return;

        elements.roomCodeInput.value = normalized;
        elements.playerNameInput.focus();
    }

    function loadSavedJoinInfo() {
        const savedName = (localStorage.getItem(STORAGE_KEYS.playerName) || '').trim();
        const savedRoom = normalizeRoomCode(localStorage.getItem(STORAGE_KEYS.lastRoom) || '');

        if (savedName && !elements.playerNameInput.value) {
            elements.playerNameInput.value = savedName;
        }

        if (savedRoom && !elements.roomCodeInput.value) {
            elements.roomCodeInput.value = savedRoom;
        }
    }

    function saveJoinInfo({ name, roomCode }) {
        try {
            localStorage.setItem(STORAGE_KEYS.playerName, name);
            localStorage.setItem(STORAGE_KEYS.lastRoom, roomCode);
        } catch (e) {
        }
    }

    function getOrCreatePeerId() {
        const saved = (localStorage.getItem(STORAGE_KEYS.peerId) || '').trim().toUpperCase();
        if (isValidPeerId(saved)) return saved;

        const created = generatePeerId();
        persistPeerId(created);
        return created;
    }

    function regeneratePeerId() {
        const created = generatePeerId();
        persistPeerId(created);
        return created;
    }

    function persistPeerId(id) {
        if (!isValidPeerId(id)) return;
        try {
            localStorage.setItem(STORAGE_KEYS.peerId, id);
        } catch (e) {
        }
    }

    function isValidPeerId(id) {
        if (!id) return false;
        if (!/^[A-Z0-9]+$/.test(id)) return false;
        return id.length >= 4;
    }

    function generatePeerId() {
        const random = Math.random().toString(36).substring(2, 2 + (PEER_ID_LENGTH - 1)).toUpperCase();
        return (PEER_ID_PREFIX + random).slice(0, PEER_ID_LENGTH);
    }

    function maybeAutoJoin() {
        const params = new URLSearchParams(window.location.search);
        const roomFromUrl = params.get('room');
        if (!roomFromUrl) return;

        const roomCode = normalizeRoomCode(elements.roomCodeInput.value);
        const name = elements.playerNameInput.value.trim();
        if (!roomCode || roomCode.length !== ROOM_CODE_LENGTH) return;
        if (!name) return;

        handleJoin();
    }

    function resetRoleCard() {
        elements.roleCard.classList.remove('hidden');
        elements.roleInfo.classList.add('hidden');
    }

    function showRoleInfo() {
        elements.roleCard.classList.add('hidden');
        elements.roleInfo.classList.remove('hidden');
        renderRoleInfo();
    }

    function renderRoleInfo() {
        if (state.role === 'impostor') {
            elements.roleTitle.textContent = 'ERES EL IMPOSTOR';
            elements.roleTitle.className = 'role-title impostor-role';
            elements.secretWordContainer.classList.add('hidden');
            elements.roleHint.textContent = (state.showHints && state.hint) ? `Pista: ${state.hint}` : '🙈 Pista oculta';
            return;
        }

        elements.roleTitle.textContent = 'ERES INOCENTE';
        elements.roleTitle.className = 'role-title';
        elements.secretWordContainer.classList.remove('hidden');
        elements.secretWord.textContent = state.word;
        elements.roleHint.textContent = 'Descubre al impostor.';
    }

    function setupVoting(candidates) {
        elements.votingList.innerHTML = '';
        state.vote = null;
        elements.submitVoteBtn.disabled = true;
        elements.submitVoteBtn.textContent = 'ENVIAR VOTO';
        elements.votingList.classList.remove('hidden');
        
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

            const roomCode = getRoomCodeForProgress();
            saveProgress(roomCode, { voteCandidateId: state.vote, voted: true });
        }
    }

    function handleVotingPhase(candidates) {
        const roomCode = getRoomCodeForProgress();
        const progress = loadProgress(roomCode);
        const votingHash = Array.isArray(candidates) ? candidates.map(c => c.id).join(',') : '';

        if (progress.votingHash !== votingHash) {
            saveProgress(roomCode, { votingHash, voteCandidateId: null, voted: false });
        } else {
            saveProgress(roomCode, { votingHash });
        }

        setupVoting(candidates);

        const updated = loadProgress(roomCode);
        if (updated.voted && updated.voteCandidateId) {
            state.vote = updated.voteCandidateId;
            window.clusterManager.sendToHost('vote', { candidateId: state.vote });
            elements.submitVoteBtn.textContent = 'VOTO ENVIADO';
            elements.submitVoteBtn.disabled = true;
            elements.votingList.classList.add('hidden');
        }
    }

    function showResults(results) {
        const bars = renderVoteBars(results);
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
        elements.resultsContent.innerHTML = html;
    }

    function renderVoteBars(results) {
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

    function showScreen(screen) {
        elements.joinSection.classList.add('hidden');
        elements.lobbySection.classList.add('hidden');
        elements.gameSection.classList.add('hidden');
        
        if (screen === 'join') elements.joinSection.classList.remove('hidden');
        if (screen === 'lobby') elements.lobbySection.classList.remove('hidden');
        if (screen === 'game') elements.gameSection.classList.remove('hidden');
    }

    function showPhase(phase) {
        state.phase = phase;
        elements.revealPhase.classList.add('hidden');
        elements.discussionPhase.classList.add('hidden');
        elements.votingPhase.classList.add('hidden');
        elements.resultsPhase.classList.add('hidden');
        
        if (phase === 'reveal') elements.revealPhase.classList.remove('hidden');
        if (phase === 'discussion') elements.discussionPhase.classList.remove('hidden');
        if (phase === 'voting') elements.votingPhase.classList.remove('hidden');
        if (phase === 'results') elements.resultsPhase.classList.remove('hidden');
    }

    function getRoomCodeForProgress() {
        const fromState = normalizeRoomCode(state.hostId || '');
        if (fromState) return fromState;
        return normalizeRoomCode(localStorage.getItem(STORAGE_KEYS.lastRoom) || '');
    }

    function getProgressKey(roomCode) {
        const token = getOrCreatePlayerToken();
        const room = normalizeRoomCode(roomCode || '');
        return `${PROGRESS_PREFIX}${room}.${token}`;
    }

    function loadProgress(roomCode) {
        const key = getProgressKey(roomCode);
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            return parsed;
        } catch (e) {
            return {};
        }
    }

    function saveProgress(roomCode, patch) {
        const key = getProgressKey(roomCode);
        const current = loadProgress(roomCode);
        const next = { ...current, ...patch };
        try {
            localStorage.setItem(key, JSON.stringify(next));
        } catch (e) {
        }
    }

    function clearProgress(roomCode) {
        const key = getProgressKey(roomCode);
        try {
            localStorage.removeItem(key);
        } catch (e) {
        }
    }

    function updateStatus(msg) {
        // Optional: toast or status bar
        console.log(msg);
    }

    init();

})();
