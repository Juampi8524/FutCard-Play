     // --- CONEXIÓN AL SERVIDOR MULTIJUGADOR ---
let socket;
try {
    socket = io('https://futcard-play.onrender.com'); 
    socket.on('connect', () => {
        console.log("¡Conectado al servidor multijugador!");
    });
} catch(e) {
    console.log("Jugando offline.");
}

// --- INICIALIZAR FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyBCGbzPLV40o-i81k-lLPId0dnFIGBciLU",
    authDomain: "futcard-play.firebaseapp.com",
    projectId: "futcard-play",
    storageBucket: "futcard-play.firebasestorage.app",
    messagingSenderId: "467062996610",
    appId: "1:467062996610:web:705d1704ad8c61b4fb3e9b",
    measurementId: "G-J80C29EPB7"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
window.db = firebase.firestore();

// --- PING DE ESTADO ONLINE EN FIREBASE ---
setInterval(() => {
    if(window.db && currentUser && currentUser.code && activeUserEmail !== 'invitado') {
        window.db.collection("usuarios").doc(currentUser.code).set({
            lastOnline: Date.now(),
            nombre: currentUser.name,
            bio: currentUser.bio || "",
            avatar: currentUser.equipped.avatar || "⚽", // Guardamos el avatar actual
            email: activeUserEmail
        }, {merge: true}).catch(e=>{});
    }
}, 30000); 

function formatLastOnline(timestamp) {
    if(!timestamp) return "Desconocido";
    let diff = Date.now() - timestamp;
    if(diff < 60000) return "<span style='color:var(--success)'>🟢 En línea</span>";
    let mins = Math.floor(diff / 60000);
    if(mins < 60) return `Hace ${mins} min`;
    let hours = Math.floor(mins / 60);
    if(hours < 24) return `Hace ${hours} hs`;
    let days = Math.floor(hours / 24);
    return `Hace ${days} días`;
}

// --- SISTEMA SOCIAL EN LA NUBE Y NOTIFICACIONES DE JUEGO ---
let unsubSocial = null;
let unsubNotifs = null;

function listenToFirebaseSocial() {
    if(!window.db) return; 
    
    if(unsubSocial) unsubSocial();
    if(unsubNotifs) unsubNotifs();

    unsubSocial = window.db.collection("solicitudes").onSnapshot((snapshot) => {
        let pending = [];
        let friendCodes = [];
        
        snapshot.forEach(docSnap => {
            let data = docSnap.data();
            if(data.destinatario === currentUser.code && data.estado === "pendiente") {
                pending.push({ docId: docSnap.id, code: data.remitente, name: data.nombreRemitente || "Jugador" });
            } else if(data.estado === "aceptado") {
                // Guardamos solo el código para buscar los datos frescos luego
                if(data.remitente === currentUser.code) {
                    friendCodes.push({ code: data.destinatario, docId: docSnap.id });
                } else if(data.destinatario === currentUser.code) {
                    friendCodes.push({ code: data.remitente, docId: docSnap.id });
                }
            }
        });

        currentUser.requests = pending;

        // ACTUALIZACIÓN DE NOMBRES Y FOTOS EN TIEMPO REAL
        // Buscamos los datos actuales de cada amigo en la colección 'usuarios'
        if(friendCodes.length === 0) {
            currentUser.friends = [];
            renderFriends();
        } else {
            let friendPromises = friendCodes.map(f => {
                return window.db.collection("usuarios").doc(f.code).get().then(uDoc => {
                    if(uDoc.exists) {
                        let uData = uDoc.data();
                        return { 
                            name: uData.nombre || "Jugador", 
                            code: f.code, 
                            docId: f.docId, 
                            avatar: uData.avatar || "⚽",
                            bio: uData.bio || ""
                        };
                    }
                    return { name: "Jugador", code: f.code, docId: f.docId, avatar: "⚽", bio: "" };
                });
            });

            Promise.all(friendPromises).then(results => {
                currentUser.friends = results;
                renderFriends();
            });
        }
    });

    unsubNotifs = window.db.collection("notificaciones").onSnapshot((snapshot) => {
        let notifs = [];
        snapshot.forEach(docSnap => {
            let data = docSnap.data();
            if(data.destinatario === currentUser.code) {
                notifs.push({ docId: docSnap.id, ...data });
            }
        });
        currentUser.notifs = notifs;
        renderNotifs();
    });
}

function renderNotifs() {
    if(!currentUser.notifs) currentUser.notifs = [];
    let badge = document.getElementById('notif-badge');
    if(badge) {
        badge.innerText = currentUser.notifs.length;
        badge.style.display = currentUser.notifs.length > 0 ? 'block' : 'none';
    }
    let list = document.getElementById('notif-list');
    if(!list) return;
    list.innerHTML = '';
    if(currentUser.notifs.length === 0) {
        list.innerHTML = "<p style='text-align:center; color:var(--text-muted); padding:20px;'>No tienes notificaciones</p>";
        return;
    }
    currentUser.notifs.forEach(n => {
        if(n.tipo === 'invite') {
            let btnAcc = currentUser.optControls ? '✔️' : 'Aceptar';
            let btnRej = currentUser.optControls ? '❌' : 'Rechazar';
            list.innerHTML += `<div class="friend-item"><div class="friend-avatar" style="background:var(--primary); color:white;">🎮</div><div class="friend-info"><div class="friend-name" style="font-weight:bold">${n.remitenteNombre}</div><div class="friend-status-text" style="font-size:0.8rem">Te invitó a jugar</div></div><div style="display:flex; gap:5px;"><button class="btn-small" onclick="acceptInvite('${n.docId}', '${n.remitenteCode}', '${n.remitenteNombre}')" style="background:var(--success);">${btnAcc}</button><button class="btn-small" onclick="rejectInvite('${n.docId}')" style="background:var(--danger);">${btnRej}</button></div></div>`;
        }
    });
}

function acceptInvite(docId, rCode, rName) {
    if(!window.db) return;
    window.db.collection("notificaciones").doc(docId).delete().catch(e=>console.log(e));
    closeScreen('notif-screen');
    lobbyState.players = 2;
    lobbyState.guestName = rName;
    lobbyState.isReady = false;
    lobbyState.guestReady = true; 
    setTxt('lobby-p2-name', rName);
    setTxt('lobby-p2-av', rName.charAt(0).toUpperCase());
    document.getElementById('lobby-p2-oval').classList.remove('empty');
    document.getElementById('lobby-p2-av').classList.remove('empty');
    document.getElementById('lobby-p2-av').classList.add('guest');
    setTxt('lobby-p2-status', 'LISTO');
    document.getElementById('lobby-p2-status').style.color = 'var(--success)';
    setLobbyMode('online', 'normal', '🌍 Online 1 vs 1');
    openLobby();
}

function rejectInvite(docId) {
    let idx = currentUser.notifs.findIndex(n => n.docId === docId);
    if(idx > -1) currentUser.notifs.splice(idx, 1);
    renderNotifs();
    if(!window.db) return;
    window.db.collection("notificaciones").doc(docId).delete().catch(e=>console.log(e));
}

// --- CONTEXTO DE PANTALLA Y SISTEMA DE PERFIL ---
let friendScreenContext = 'social'; 
let currentFriendView = null;

function inviteToLobby(friendCode, friendName) {
    if(!window.db) { alert("Error de conexión a Firebase."); return; }
    window.db.collection("notificaciones").add({
        destinatario: friendCode,
        remitenteCode: currentUser.code,
        remitenteNombre: currentUser.name,
        tipo: 'invite',
        timestamp: Date.now()
    }).then(() => {
        alert("¡Invitación enviada a " + friendName + "!");
        closeScreen('friends-screen'); 
    }).catch(e => console.log(e));
}

function inviteToLobbyFromProfile() {
    if(currentFriendView) {
        closeScreen('friend-profile-screen');
        inviteToLobby(currentFriendView.code, currentFriendView.name);
    }
}

async function openFriendProfile(code, name, docId) {
    currentFriendView = { code, name, docId };
    setTxt('fp-name', name);
    setTxt('fp-code', code);
    
    // MEJORA: Solo mostrar botón de invitar si venimos del Lobby
    let inviteBtn = document.getElementById('fp-action-btn');
    if(inviteBtn) inviteBtn.style.display = (friendScreenContext === 'lobby') ? 'block' : 'none';

    document.getElementById('fp-bio').innerText = "Cargando descripción...";
    document.getElementById('fp-status').innerHTML = "Cargando estado...";
    openScreen('friend-profile-screen');
    
    if(window.db) {
        try {
            let doc = await window.db.collection("usuarios").doc(code).get();
            if(doc.exists) {
                let data = doc.data();
                setTxt('fp-avatar', data.avatar || "⚽");
                document.getElementById('fp-bio').innerText = data.bio || "Sin descripción.";
                document.getElementById('fp-status').innerHTML = "Última vez: " + formatLastOnline(data.lastOnline);
                // Actualizamos el nombre por si cambió
                setTxt('fp-name', data.nombre || name);
            } else {
                setTxt('fp-avatar', "⚽");
                document.getElementById('fp-bio').innerText = "Sin descripción.";
                document.getElementById('fp-status').innerHTML = "Última vez: Desconocido";
            }
        } catch(e) {
            document.getElementById('fp-bio').innerText = "Sin descripción.";
            document.getElementById('fp-status').innerHTML = "Última vez: Desconocido";
        }
    }
}

async function deleteFriendFromProfile() {
    if(!currentFriendView || !window.db) return;
    if(confirm("¿Seguro que quieres eliminar a " + currentFriendView.name + " de tus amigos?")) {
        await window.db.collection("solicitudes").doc(currentFriendView.docId).delete();
        closeScreen('friend-profile-screen');
        alert("Amigo eliminado.");
    }
}

function sendFriendRequest() {
    const input = document.getElementById('add-friend-input');
    if (!input) return;
    const code = input.value.trim();
    if (code.length !== 6) return alert("El código debe tener 6 números.");
    if (code === currentUser.code) return alert("No puedes agregarte a ti mismo.");
    if (currentUser.friends && currentUser.friends.some(f => f.code === code)) {
        return alert("Ya tienes a este jugador en tu lista de amigos.");
    }
    if (!window.db) return alert("Error de conexión con Firebase.");
    window.db.collection("usuarios").doc(code).get().then(doc => {
        if (doc.exists) {
            window.db.collection("solicitudes").add({
                remitente: currentUser.code,
                nombreRemitente: currentUser.name,
                destinatario: code,
                nombreDestinatario: doc.data().nombre || "Jugador",
                estado: "pendiente",
                timestamp: Date.now()
            }).then(() => {
                alert("¡Solicitud enviada a " + (doc.data().nombre || "Jugador") + "!");
                input.value = "";
            }).catch(e => alert("Error al enviar solicitud."));
        } else {
            alert("No se encontró al jugador.");
        }
    }).catch(e => alert("Error al buscar en la base de datos."));
}

function acceptFriend(index) {
    const req = currentUser.requests[index];
    if (!req || !window.db) return;
    window.db.collection("solicitudes").doc(req.docId).update({
        estado: "aceptado"
    }).catch(e => console.log(e));
}

function rejectFriend(index) {
    const req = currentUser.requests[index];
    if (!req || !window.db) return;
    window.db.collection("solicitudes").doc(req.docId).delete().catch(e => console.log(e));
}

// --- MEJORA: SELECCIÓN DE AVATAR PRESET ---
function selectPresetAvatar(emoji) {
    currentUser.tempAvatar = emoji;
    document.querySelectorAll('.av-preset-opt').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-av') === emoji);
    });
}

// --- FUNCIONES ORIGINALES ---
function setTxt(id, val) { let el = document.getElementById(id); if(el) el.innerText = val; }
function setVal(id, val) { let el = document.getElementById(id); if(el) el.value = val; }

function requestFullscreenAndLock() {
    let doc = document.documentElement; let req = doc.requestFullscreen || doc.mozRequestFullScreen || doc.webkitRequestFullscreen || doc.msRequestFullscreen;
    if(req) { req.call(doc).then(()=>{ if(screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(e=>console.log(e)); }).catch(e=>console.log(e)); } 
    else if(screen.orientation && screen.orientation.lock) { screen.orientation.lock('landscape').catch(e=>console.log(e)); }
    let warn = document.getElementById('landscape-warning'); if(warn) warn.style.display = 'none';
}

const i18n = {
    es: { rotate_title:"Gira tu dispositivo", rotate_desc:"Diseñado para modo horizontal.", btn_fullscreen:"Forzar Pantalla", welcome:"Bienvenido,", friend_code:"Código:", play_btn:"¡Jugar!", play_desc:"Gol de oro, clima y replays", level:"Niv.", nav_home:"Inicio", nav_team:"Misiones", nav_social:"Amigos", nav_play:"Jugar", nav_shop:"Tienda", nav_settings:"Ajustes", nav_pass:"Pase", team_title:"Misiones", mission_daily:"Diarias", mission_weekly:"Semanales", select_mode:"Modo", btn_ia:"🤖 Partido vs IA", btn_local:"🎮 Local 1 vs 1", btn_close:"Cerrar", pause_title:"Pausa", btn_resume:"▶ Continuar", btn_abandon:"🚪 Abandonar", social_title:"Amigos", btn_add:"Añadir", social_pending:"Pendientes", social_friends:"Amigos", btn_back:"Volver", shop_title:"Tienda Diaria", settings_title:"Ajustes", btn_login_google:"Vincular Google", btn_logout:"Cerrar sesión", btn_save_close:"Guardar", login_title:"Iniciar Sesión", login_desc:"Usa tu cuenta", btn_cancel:"Cancelar", btn_next:"Siguiente", match_pre:"Previa", pass_title:"Pase Estelar", badge_home: "LOCAL", badge_away: "VISIT." },
    en: { rotate_title:"Rotate Device", rotate_desc:"Designed for landscape mode.", btn_fullscreen:"Force Fullscreen", welcome:"Welcome back,", friend_code:"Code:", play_btn:"Play!", play_desc:"Golden goal & Replays", level:"Lvl.", nav_home:"Home", nav_team:"Missions", nav_social:"Friends", nav_play:"Play", nav_shop:"Shop", nav_settings:"Settings", nav_pass:"Pass", team_title:"Missions", mission_daily:"Daily", mission_weekly:"Weekly", select_mode:"Mode", btn_ia:"🤖 Play vs AI", btn_local:"🎮 Local 1v1", btn_close:"Close", pause_title:"Paused", btn_resume:"▶ Resume", btn_abandon:"🚪 Forfeit", social_title:"Friends", btn_add:"Add", social_pending:"Pending", social_friends:"Friends", btn_back:"Back", shop_title:"Daily Shop", settings_title:"Settings", btn_login_google:"Link Google", btn_logout:"Log Out", btn_save_close:"Save", login_title:"Sign In", login_desc:"Use Google account", btn_cancel:"Cancel", btn_next:"Next", match_pre:"Pre-match", pass_title:"Star Pass", badge_home: "HOME", badge_away: "AWAY" },
    pt: { rotate_title:"Gire seu dispositivo", rotate_desc:"FutCard Play fue proyectado para modo paisagem.", btn_fullscreen:"Forçar Tela Cheia", welcome:"Bem-vindo,", friend_code:"Código:", play_btn:"Jogar!", play_desc:"Física+Clima+Replay", level:"Nív.", nav_home:"Início", nav_team:"Missões", nav_social:"Amigos", nav_play:"Jogar", nav_shop:"Loja", nav_settings:"Config.", nav_pass:"Passe", team_title:"Missões", mission_daily:"Diárias", mission_weekly:"Semanais", select_mode:"Modo", btn_ia:"🤖 Jogar vs IA", btn_local:"🎮 Local 1v1", btn_close:"Fechar", pause_title:"Pausado", btn_resume:"▶ Continuar", btn_abandon:"🚪 Abandonar", social_title:"Amigos", btn_add:"Add", social_pending:"Pendentes", social_friends:"Amigos", btn_back:"Voltar", shop_title:"Loja Diária", settings_title:"Configurações", btn_login_google:"Vincular Google", btn_logout:"Sair", btn_save_close:"Salvar", login_title:"Fazer Login", login_desc:"Use sua cuenta Google", btn_cancel:"Cancelar", btn_next:"Próximo", match_pre:"Pré-jogo", pass_title:"Passe Estelar", badge_home: "CASA", badge_away: "FORA" }
};

const FULL_CATALOG = {
    packs: { 'bronce':{es:'Sobre Bronce',en:'Bronze Pack',pt:'Pacote Bronze',p:10, bg:'#cd7f32'}, 'plata':{es:'Sobre Plata',en:'Silver Pack',pt:'Pacote Prata',p:25, bg:'#c0c0c0'}, 'oro':{es:'Sobre Oro',en:'Gold Pack',pt:'Pacote Ouro',p:50, bg:'#facc15'} },
    ball: { 
        'clasica':{es:'Clásica',p:0,bg:'#fff',pat:'#000'}, 'oro':{es:'Oro',p:500,bg:'#facc15',pat:'#b8860b',g:'#facc15'}, 'fuego':{es:'Fuego',p:800,bg:'#1f2937',pat:'#ef4444',g:'#ef4444'}, 
        'galaxia':{es:'Galaxia',p:1200,bg:'#1e1b4b',pat:'#8b5cf6',g:'#c4b5fd'}, 'neon':{es:'Neón',p:600,bg:'#000',pat:'#39ff14',g:'#39ff14'}, 'magma':{es:'Magma',p:900,bg:'#450a0a',pat:'#f97316',g:'#f97316'}, 
        'hielo':{es:'Hielo',p:700,bg:'#e0f2fe',pat:'#38bdf8',g:'#38bdf8'}, 'bosque':{es:'Bosque',p:500,bg:'#14532d',pat:'#4ade80'}, 'cuero':{es:'Cuero',p:400,bg:'#78350f',pat:'#451a03'}, 
        'disco':{es:'Disco',p:1000,bg:'#f8fafc',pat:'#6366f1',g:'#818cf8'}, 'fantasma':{es:'Fantasma',p:1500,bg:'#f3f4f6',pat:'#cbd5e1',g:'#fff'}, 'arcoiris':{es:'Arcoíris',p:2000,bg:'#ec4899',pat:'#3b82f6',g:'#eab308'}, 
        'metal':{es:'Metal',p:800,bg:'#94a3b8',pat:'#475569'}, 'rayo':{es:'Rayo',p:1300,bg:'#fef08a',pat:'#ca8a04',g:'#fde047'}, 'slime':{es:'Slime',p:600,bg:'#86efac',pat:'#16a34a'}
    },
    skin: { 
        'base':{es:'Base',p:0,c:'#ef4444',s:'#ffb8b8'}, 'robot':{es:'Robot',p:1000,c:'#94a3b8',s:'#475569'}, 'alien':{es:'Alien',p:1200,c:'#22c55e',s:'#14532d'}, 
        'ninja':{es:'Ninja',p:1500,c:'#111827',s:'#374151'}, 'zombie':{es:'Zombie',p:800,c:'#4d7c0f',s:'#a3e635'}, 'pirata':{es:'Pirata',p:1100,c:'#78350f',s:'#fef3c7'}, 
        'astro':{es:'Astronauta',p:2000,c:'#f8fafc',s:'#cbd5e1'}, 'cabal':{es:'Caballero',p:1800,c:'#d1d5db',s:'#9ca3af'}, 'viking':{es:'Vikingo',p:1600,c:'#451a03',s:'#d97706'}, 
        'demon':{es:'Demonio',p:2500,c:'#7f1d1d',s:'#ef4444'}, 'cyborg':{es:'Cyborg',p:1700,c:'#38bdf8',s:'#0f172a'}, 'momia':{es:'Momia',p:900,c:'#fef3c7',s:'#b45309'}, 
        'rey':{es:'Rey',p:3000,c:'#facc15',s:'#ca8a04'}, 'mago':{es:'Mago',p:2200,c:'#c084fc',s:'#4c1d95'}, 'orco':{es:'Orco',p:1400,c:'#15803d',s:'#064e3b'}
    },
    stadium:{ 
        'clasico':{es:'Clásico',p:0,c1:'#4caf50',c2:'#45a049',l:'rgba(255,255,255,0.6)'}, 'nieve':{es:'Nieve',p:1000,c1:'#f1f5f9',c2:'#e2e8f0',l:'#94a3b8'}, 
        'tierra':{es:'Tierra',p:800,c1:'#d97706',c2:'#b45309',l:'#fef3c7'}, 'noche':{es:'Noche',p:1200,c1:'#0f172a',c2:'#1e293b',l:'#38bdf8'}, 
        'desier':{es:'Desierto',p:1500,c1:'#fde047',c2:'#facc15',l:'#854d0e'}, 'jungla':{es:'Jungla',p:1400,c1:'#064e3b',c2:'#065f46',l:'#34d399'}, 
        'volcan':{es:'Volcán',p:2000,c1:'#450a0a',c2:'#7f1d1d',l:'#f97316'}, 'ciudad':{es:'Ciudad',p:1800,c1:'#334155',c2:'#1e293b',l:'#facc15'}, 
        'espac':{es:'Espacio',p:3000,c1:'#020617',c2:'#1e1b4b',l:'#a29bfe'}, 'futur':{es:'Futuro',p:2500,c1:'#164e63',c2:'#083344',l:'#22d3ee'},
        'playa':{es:'Playa',p:1300,c1:'#fef08a',c2:'#fde047',l:'#0ea5e9'}, 'pantano':{es:'Pantano',p:1100,c1:'#3f6212',c2:'#365314',l:'#a3e635'}, 
        'luna':{es:'Luna',p:2800,c1:'#64748b',c2:'#475569',l:'#f8fafc'}, 'marte':{es:'Marte',p:2600,c1:'#b91c1c',c2:'#991b1b',l:'#fca5a5'}, 
        'ruinas':{es:'Ruinas',p:1700,c1:'#a8a29e',c2:'#71717a',l:'#2dd4bf'}
    },
    // MEJORA: CATEGORÍA AVATAR AGREGADA
    avatar: {
        '⚽':{es:'Avatar Balón',p:0}, '🏆':{es:'Avatar Copa',p:100}, '👟':{es:'Avatar Botín',p:150}, '🏟️':{es:'Avatar Estadio',p:200}, '🔥':{es:'Avatar Fuego',p:300},
        '🌟':{es:'Avatar Estrella',p:500}, '🧤':{es:'Avatar Portero',p:400}, '📣':{es:'Avatar Fan',p:100}, '👑':{es:'Avatar Rey',p:1000}, '🎯':{es:'Avatar Precisión',p:250}
    },
    effect: { 
        'ninguno':{es:'Ninguno',p:0}, 'confeti':{es:'Confeti',p:500}, 'fuego':{es:'Fuego',p:1000}, 'rayos':{es:'Rayos',p:1200}, 'burbu':{es:'Burbujas',p:700}, 
        'coraz':{es:'Corazones',p:800}, 'estrell':{es:'Estrellas',p:1000}, 'humo':{es:'Humo',p:600}, 'oro_ef':{es:'Lluvia Oro',p:2000}, 'pixel':{es:'Pixel',p:1500},
        'agua':{es:'Agua',p:900}, 'viento':{es:'Viento',p:1100}, 'sangre':{es:'Sangre',p:1800}, 'hojas':{es:'Hojas',p:700}, 'notas':{es:'Música',p:1300}
    }
};

const mDefs = { daily:[{id:'d1', es:'Juega 1 partido', t:1, r:50, tp:'play'}, {id:'d2', es:'Anota 3 goles', t:3, r:80, tp:'goals'}, {id:'d3', es:'Gana 1 partido', t:1, r:100, tp:'wins'}], weekly:[{id:'w1', es:'Juega 10 partidos', t:10, r:500, tp:'play'}, {id:'w2', es:'Anota 20 goles', t:20, r:800, tp:'goals'}, {id:'w3', es:'Gana 5 partidos', t:5, r:1000, tp:'wins'}, {id:'w4', es:'Juega 20 partidos', t:20, r:1200, tp:'play'}, {id:'w5', es:'Anota 50 goles', t:50, r:1500, tp:'goals'}, {id:'w6', es:'Gana 10 partidos', t:10, r:2000, tp:'wins'}] };

let chaosActiveEvent = null, chaosTimer = 0, chaosEventDuration = 0;
let wind = {vx: 0, vy: 0}, portals = [], mudPuddles = [], portalCooldown = 0, iceMode = false;
const chaosNames = { 'wind': '🌪️ ¡VIENTO EXTREMO!', 'mud': '💩 ¡SUELO PEGAJOSO!', 'portals': '🌀 ¡PORTALES ACTIVOS!', 'giant_ball': '⚽ ¡PELOTA GIGANTE!', 'ice': '🧊 ¡CANCHA DE HIELO!' };

let activeUserEmail = localStorage.getItem('futActiveEmail') || 'invitado';
let sysTheme = localStorage.getItem('futTheme') || 'dark'; let sysLang = localStorage.getItem('futLang') || 'es';

let allAccounts = {};
try {
    allAccounts = JSON.parse(localStorage.getItem('futAccounts')) || {};
} catch(e) { allAccounts = {}; }

if (!allAccounts['invitado']) {
    allAccounts['invitado'] = { name: 'JugadorInvitado', bio: "", stars: 0, password: "", coins: 500, dia: 100, xp: 0, level: 1, passPremium: false, claimedPass: [], owned: { ball: ['clasica'], skin: ['base'], stadium: ['clasico'], avatar: ['⚽'], effect: ['ninguno'] }, equipped: { ball: 'clasica', skin: 'base', stadium: 'clasico', avatar: '⚽', effect: 'ninguno' }, code: Math.floor(100000 + Math.random() * 900000).toString(), stats: { daily:{play:0,goals:0,wins:0,claimed:[]}, weekly:{play:0,goals:0,wins:0,claimed:[]}, lastDaily:new Date().toDateString(), lastWeekly:new Date().toDateString() }, friends: [], requests: [], hudPrefs: { joy:{x:0,y:0,s:1}, actions:{x:0,y:0,s:1}, emotes:{x:0,y:0,s:1} }, optControls: false };
    localStorage.setItem('futAccounts', JSON.stringify(allAccounts));
}
let currentUser;
let matchStats = {p1Pos:0, p2Pos:0, p1Sho:0, p2Sho:0, p1Stl:0, p2Stl:0};
let authMode = 'login'; 

function loadAccount(email) {
    if (!allAccounts[email]) return; 
    currentUser = allAccounts[email];
    if (!currentUser.bio) currentUser.bio = "";
    if (!currentUser.owned.avatar) currentUser.owned.avatar = ['⚽'];
    if (!currentUser.equipped.avatar) currentUser.equipped.avatar = '⚽';
    if (!currentUser.claimedPass) currentUser.claimedPass = []; 
    if (!currentUser.hudPrefs) currentUser.hudPrefs = { joy:{x:0,y:0,s:1}, actions:{x:0,y:0,s:1}, emotes:{x:0,y:0,s:1} };
    if (!currentUser.requests) currentUser.requests = [];
    if (!currentUser.friends) currentUser.friends = [];
    if (!currentUser.notifs) currentUser.notifs = [];
    if (currentUser.optControls === undefined) currentUser.optControls = false;
    if (!currentUser.code) currentUser.code = Math.floor(100000 + Math.random() * 900000).toString(); 
    let btnOpenLogin = document.getElementById('btn-open-login'); let btnLogout = document.getElementById('btn-logout');
    if(btnOpenLogin && btnLogout) { if (email === 'invitado') { btnOpenLogin.style.display = 'flex'; btnLogout.style.display = 'none'; } else { btnOpenLogin.style.display = 'none'; btnLogout.style.display = 'flex'; } }
    applyProfile(); checkMissionResets(); renderMissions(); applyHUDPrefs();
    listenToFirebaseSocial();
}

function saveAccounts() { 
    if (!currentUser) return;
    allAccounts[activeUserEmail] = currentUser; 
    localStorage.setItem('futAccounts', JSON.stringify(allAccounts)); 
    applyProfile(); 
    if(window.db && currentUser.code && activeUserEmail !== 'invitado') {
        window.db.collection("usuarios").doc(currentUser.code).set({
            nombre: currentUser.name,
            bio: currentUser.bio || "",
            avatar: currentUser.equipped.avatar || "⚽",
            email: activeUserEmail,
            lastOnline: Date.now(),
            stars: currentUser.stars || 0,
            level: currentUser.level || 1
        }, {merge: true}).catch(e=>{});
    }
}

function checkInitialLogin() { if(activeUserEmail === 'invitado') { openScreen('login-screen'); } }
function toggleAuthMode() { authMode = authMode === 'login' ? 'register' : 'login'; document.getElementById('auth-title').innerText = authMode === 'login' ? 'Iniciar Sesión' : 'Registrarse'; document.getElementById('login-pass-confirm').style.display = authMode === 'login' ? 'none' : 'block'; document.getElementById('btn-auth-action').innerText = authMode === 'login' ? 'Entrar' : 'Crear Cuenta'; document.getElementById('auth-toggle-link').innerText = authMode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'; }

function processAuth() { 
    let email = document.getElementById('login-email').value.trim().toLowerCase(); 
    let pass = document.getElementById('login-pass').value.trim(); 
    if (!email || !pass) return alert("Por favor completa los campos."); 
    if (!email.includes('@')) return alert("Introduce un correo válido."); 
    const loader = document.getElementById('loading-overlay'); 
    loader.style.display = 'flex'; 
    setTimeout(() => loader.style.opacity = '1', 10); 
    setTimeout(() => { 
        loader.style.opacity = '0'; 
        setTimeout(()=> loader.style.display='none', 400); 
        if (authMode === 'register') { 
            let passC = document.getElementById('login-pass-confirm').value.trim(); 
            if(pass !== passC) return alert("Las contraseñas no coinciden."); 
            if(allAccounts[email]) return alert("Este correo ya está registrado."); 
            if(pass.length < 4) return alert("La contraseña es muy corta."); 
            allAccounts[email] = JSON.parse(JSON.stringify(allAccounts['invitado'])); 
            allAccounts[email].password = pass; 
            allAccounts[email].name = email.split('@')[0].substring(0, 10); 
            allAccounts[email].code = Math.floor(100000 + Math.random() * 900000).toString();
            activeUserEmail = email; 
            localStorage.setItem('futActiveEmail', activeUserEmail); 
            loadAccount(activeUserEmail); 
            saveAccounts(); 
            alert("¡Cuenta creada exitosamente! Tu código es: " + currentUser.code); 
            closeScreen('login-screen'); 
        } else { 
            if (!allAccounts[email]) return alert("No existe una cuenta."); 
            if (allAccounts[email].password !== pass && allAccounts[email].password !== 'google_auth') return alert("Contraseña incorrecta."); 
            activeUserEmail = email; 
            localStorage.setItem('futActiveEmail', activeUserEmail); 
            loadAccount(activeUserEmail); 
            saveAccounts(); 
            closeScreen('login-screen'); 
        } 
    }, 800); 
}

function closeLoginIfGuest() { alert("Debes iniciar sesión o registrarte para poder jugar."); }
function simulateGoogleLogin() { let fakeEmail = prompt("SIMULADOR GOOGLE: Ingresa tu correo", "jugador@gmail.com"); if(fakeEmail) { fakeEmail = fakeEmail.toLowerCase().trim(); const loader = document.getElementById('loading-overlay'); loader.style.display = 'flex'; setTimeout(() => loader.style.opacity = '1', 10); setTimeout(() => { loader.style.opacity = '0'; setTimeout(()=> loader.style.display='none', 400); if(!allAccounts[fakeEmail]) { allAccounts[fakeEmail] = JSON.parse(JSON.stringify(allAccounts['invitado'])); allAccounts[fakeEmail].password = 'google_auth'; allAccounts[fakeEmail].name = fakeEmail.split('@')[0].substring(0, 10); allAccounts[fakeEmail].code = Math.floor(100000 + Math.random() * 900000).toString();} activeUserEmail = fakeEmail; localStorage.setItem('futActiveEmail', activeUserEmail); loadAccount(activeUserEmail); saveAccounts(); closeScreen('login-screen'); }, 1000); } }

function processLogout() { 
    activeUserEmail = 'invitado'; 
    localStorage.setItem('futActiveEmail', activeUserEmail); 
    loadAccount('invitado'); 
    closeScreen('settings-screen'); 
    checkInitialLogin(); 
}

function applyProfile() { 
    setTxt('dash-coins', currentUser.coins); setTxt('dash-card-coins', currentUser.coins); 
    setTxt('dash-dia', currentUser.dia); setTxt('dash-card-dia', currentUser.dia);
    setTxt('dash-username', currentUser.name); 
    // MEJORA: El avatar dinámico en el header y lobby
    setTxt('dash-avatar', currentUser.equipped.avatar || "⚽");
    setTxt('lobby-p1-av', currentUser.equipped.avatar || "⚽");
    
    setTxt('dash-level', currentUser.level); setVal('player-name-input', currentUser.name); 
    setVal('player-bio-input', currentUser.bio || "");
    
    // Marcar avatar activo en ajustes
    document.querySelectorAll('.av-preset-opt').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-av') === currentUser.equipped.avatar);
    });

    setTxt('dash-stars', currentUser.stars || 0); setTxt('dash-card-stars', currentUser.stars || 0); 
    setTxt('dash-friend-code', currentUser.code); 
    setTxt('modal-friend-code-top', currentUser.code); 
    setVal('invite-link-input', "https://futcard.app/invite?c=" + currentUser.code);
    let xpNeeded = currentUser.level * 100; setTxt('dash-xp-text', `${currentUser.xp} / ${xpNeeded}`); 
    let xpFill = document.getElementById('dash-xp-fill'); if(xpFill) xpFill.style.width = `${Math.min((currentUser.xp/xpNeeded)*100, 100)}%`; 
    setTxt('lobby-p1-name', currentUser.name); 
    document.body.className = sysTheme + "-theme"; 
    document.querySelectorAll('[data-i18n]').forEach(el => { let key = el.getAttribute('data-i18n'); if(i18n[sysLang] && i18n[sysLang][key]) el.innerHTML = i18n[sysLang][key]; }); 
    updateGameStyles(); 
}

function addXP(amount) { currentUser.xp += amount; let xpNeeded = currentUser.level * 100; if (currentUser.xp >= xpNeeded) { currentUser.level++; currentUser.xp -= xpNeeded; currentUser.coins += 50; alert(`¡Nivel ${currentUser.level}! (+50 🪙)`); } saveAccounts(); }

function applyHUDPrefs() { if(!currentUser.hudPrefs) return; let joy = document.getElementById('virtual-joystick'); let acts = document.getElementById('action-buttons-box'); let emts = document.getElementById('emote-container-box'); if(joy) joy.style.transform = `translate(${currentUser.hudPrefs.joy.x}px, ${currentUser.hudPrefs.joy.y}px) scale(${currentUser.hudPrefs.joy.s})`; if(acts) acts.style.transform = `translate(${currentUser.hudPrefs.actions.x}px, ${currentUser.hudPrefs.actions.y}px) scale(${currentUser.hudPrefs.actions.s})`; if(emts) emts.style.transform = `translate(${currentUser.hudPrefs.emotes.x}px, ${currentUser.hudPrefs.emotes.y}px) scale(${currentUser.hudPrefs.emotes.s})`; }
let activeHUDObj = null; let initTouchX, initTouchY, initObjX, initObjY;

function makeDraggable(id, prefKey) { 
    let el = document.getElementById(id); if(!el) return; el.classList.add('hud-editable'); 
    el.addEventListener('touchstart', e => { 
        if(gameState !== 'hud_edit') return; e.preventDefault(); activeHUDObj = { el, key: prefKey }; 
        let touch = e.touches ? e.touches[0] : e; initTouchX = touch.clientX; initTouchY = touch.clientY; 
        initObjX = currentUser.hudPrefs[prefKey].x || 0; initObjY = currentUser.hudPrefs[prefKey].y || 0; 
        let slider = document.getElementById('hud-scale-slider'); if(slider) slider.value = currentUser.hudPrefs[prefKey].s || 1; 
        document.querySelectorAll('.hud-editable').forEach(n => n.style.boxShadow = ''); el.style.boxShadow = '0 0 20px yellow'; 
    }, {passive: false}); 
    el.addEventListener('touchmove', e => { 
        if(gameState !== 'hud_edit' || !activeHUDObj || activeHUDObj.el !== el) return; e.preventDefault(); 
        let touch = e.touches ? e.touches[0] : e; let dx = touch.clientX - initTouchX; let dy = touch.clientY - initTouchY; 
        currentUser.hudPrefs[prefKey].x = initObjX + dx; currentUser.hudPrefs[prefKey].y = initObjY + dy; applyHUDPrefs(); 
    }, {passive: false}); 
}

function enterHUDEdit() { closeScreen('settings-screen'); document.getElementById('dashboard-screen').style.display = 'none'; document.getElementById('lobby-screen').style.display = 'none'; document.getElementById('bottom-nav').style.display = 'none'; document.getElementById('match-interface').style.display = 'flex'; clearInterval(tInt); gameState = 'hud_edit'; resetPositions(); updateGameStyles(); setTxt('score1', 0); setTxt('score2', 0); setTxt('timer', 'EDICIÓN'); document.getElementById('hud-edit-overlay').style.display = 'flex'; applyHUDPrefs(); document.querySelectorAll('.hud-editable').forEach(n => n.style.boxShadow = '0 0 10px rgba(255,255,255,0.5)'); }
function updateHUDScale(val) { if(activeHUDObj) { currentUser.hudPrefs[activeHUDObj.key].s = parseFloat(val); applyHUDPrefs(); } }
function resetHUD() { currentUser.hudPrefs = { joy: {x:0, y:0, s:1}, actions: {x:0, y:0, s:1}, emotes: {x:0, y:0, s:1} }; applyHUDPrefs(); let slider = document.getElementById('hud-scale-slider'); if(slider) slider.value = 1; }
function saveHUD() { saveAccounts(); document.getElementById('hud-edit-overlay').style.display = 'none'; document.querySelectorAll('.hud-editable').forEach(node => node.style.boxShadow = ''); goHome(); }

function applyTheme(theme) { sysTheme = theme; localStorage.setItem('futTheme', theme); document.body.className = theme + "-theme"; }
function applyLanguage(lang) { sysLang = lang; localStorage.setItem('futLang', lang); document.querySelectorAll('[data-i18n]').forEach(el => { let key = el.getAttribute('data-i18n'); if(i18n[lang] && i18n[lang][key]) el.innerHTML = i18n[lang][key]; }); renderMissions(); if(document.getElementById('shop-screen').style.display==='flex') renderShop(); renderPass(); }

function openSettings() { 
    setVal('setting-theme', sysTheme); 
    setVal('setting-lang', sysLang); 
    setVal('setting-opt-controls', currentUser.optControls ? "true" : "false");
    openScreen('settings-screen'); 
}

function saveSettings() { 
    let nameInput = document.getElementById('player-name-input'); 
    let bioInput = document.getElementById('player-bio-input');
    currentUser.name = nameInput ? nameInput.value.trim() : currentUser.name; 
    currentUser.bio = bioInput ? bioInput.value.trim() : currentUser.bio;
    let themeSel = document.getElementById('setting-theme'); if(themeSel) applyTheme(themeSel.value); 
    let langSel = document.getElementById('setting-lang'); if(langSel) applyLanguage(langSel.value); 
    let optSel = document.getElementById('setting-opt-controls'); if(optSel) currentUser.optControls = (optSel.value === "true");
    saveAccounts(); 
    closeScreen('settings-screen'); 
    renderFriends(); 
}

// MEJORA: FUNCIÓN PARA ELEGIR EL AVATAR EN AJUSTES
function selectPresetAvatar(emoji) {
    currentUser.equipped.avatar = emoji;
    document.querySelectorAll('.av-preset-opt').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-av') === emoji);
    });
}

function checkMissionResets() { let t = new Date().toDateString(); let w = new Date(); w.setHours(0,0,0,0); let d = w.getDay()||7; if(d!==1) w.setHours(-24*(d-1)); w=w.toDateString(); let changed=false; if(currentUser.stats.lastDaily!==t){currentUser.stats.daily={play:0,goals:0,wins:0,claimed:[]};currentUser.stats.lastDaily=t;changed=true;} if(currentUser.stats.lastWeekly!==w){currentUser.stats.weekly={play:0,goals:0,wins:0,claimed:[]};currentUser.stats.lastWeekly=w;changed=true;} if(changed) saveAccounts(); }
function addStat(type, amount) { checkMissionResets(); currentUser.stats.daily[type]+=amount; currentUser.stats.weekly[type]+=amount; addXP(10); saveAccounts(); let eqScreen = document.getElementById('equipo-screen'); if(eqScreen && eqScreen.style.display==='flex') renderMissions(); }
function openEquipo() { openScreen('equipo-screen'); checkMissionResets(); renderMissions(); }

function renderMissions() {
    const rGrp = (grp, elId) => {
        const cont = document.getElementById(elId); if(!cont) return; cont.innerHTML = '';
        mDefs[grp].forEach(m => {
            let prog = Math.min(currentUser.stats[grp][m.tp], m.t); let pct = (prog/m.t)*100; let isC = currentUser.stats[grp].claimed.includes(m.id); let canC = prog>=m.t && !isC;
            let btnText = isC ? (sysLang==='en'?'Claimed':'Cobrado') : (sysLang==='en'?'Claim':'Cobrar');
            let btn = isC ? `<button class="btn-claim" disabled style="background:var(--success)">${btnText}</button>` : `<button class="btn-claim" ${canC?'':'disabled'} onclick="claimMission('${grp}', '${m.id}', ${m.r})">${btnText}</button>`;
            let title = m[sysLang] || m.es;
            cont.innerHTML += `<div class="mission-card"><div class="mission-info"><p style="font-weight:bold;margin:0 0 8px 0;">${title}</p><div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div><div style="font-size:0.8rem;color:var(--text-muted);font-weight:bold;display:flex;justify-content:space-between;"><span>${prog}/${m.t}</span><span style="color:var(--gold)">🪙 ${m.r}</span></div></div>${btn}</div>`;
        });
    }; rGrp('daily', 'daily-missions-list'); rGrp('weekly', 'weekly-missions-list');
}
function claimMission(g, id, r) { currentUser.stats[g].claimed.push(id); currentUser.coins+=r; saveAccounts(); renderMissions(); }

function renderPass() {
    let progLabel = document.getElementById('pass-global-prog'); if(progLabel) progLabel.innerText = `${currentUser.level}/100`; 
    let btnBuy = document.getElementById('btn-buy-pass'); if(btnBuy) btnBuy.style.display = currentUser.passPremium ? "none" : "block";
    let cont = document.getElementById('pass-track-content'); if(!cont) return; cont.innerHTML = '';
    for(let i=1; i<=100; i++) {
        let isUnl = currentUser.level >= i; let isPrem = !currentUser.passPremium && i%5!==0 && i>1;
        let ico = (i%10===0)?'💎':(i%5===0)?'📦':'🪙'; let txt = (i%10===0)?`10 Gems`:`${i*1000} Coins`;
        let isClaimed = currentUser.claimedPass && currentUser.claimedPass.includes(i);
        let stat = '';
        if(isUnl) { if(!isPrem) { if(isClaimed) stat = `<span style="color:var(--success);font-weight:bold;font-size:0.8rem;">✔️</span>`; else stat = `<button class="btn-claim" style="padding:4px 8px;" onclick="claimPass(${i}, ${i%10===0})">Reclamar</button>`; } else stat = `<span style="color:var(--danger);font-size:0.8rem;">Premium</span>`; } else { stat = `<span style="color:var(--text-muted);font-size:0.8rem;">🔒</span>`; }
        let premCls = (i%10===0) ? 'border-color:var(--gold);background:var(--panel-bg);' : ''; let bdColor = isUnl ? (isPrem ? '#94a3b8' : 'var(--success)') : '#94a3b8';
        cont.innerHTML += `<div class="pass-node" style="opacity:${isUnl?1:0.5}"><div class="node-level">Niv. ${i}</div><div style="width:60px;height:60px;border-radius:50%;display:flex;justify-content:center;align-items:center;font-size:1.5rem;border:3px solid ${bdColor};${premCls}">${ico}</div><div style="margin:5px 0;font-size:0.8rem;font-weight:bold;">${txt}</div>${stat}</div>`;
    }
}

function claimPass(lvl, isGem) { if(!currentUser.claimedPass) currentUser.claimedPass = []; currentUser.claimedPass.push(lvl); if(isGem) currentUser.dia += 10; else currentUser.coins += lvl * 1000; saveAccounts(); renderPass(); }
function buyPremiumPass() { if(currentUser.dia >= 50) { currentUser.dia -= 50; currentUser.passPremium = true; saveAccounts(); renderPass(); } else alert("No tienes diamantes (50💎)."); }

function openCasillero() { openScreen('casillero-screen'); renderCasillero('ball'); }

function renderCasillero(type) {
    ['ball','skin','stadium','avatar','effect'].forEach(t => {
        let btn = document.getElementById('tab-cas-' + t);
        if(btn) { if(t===type) btn.classList.add('active'); else btn.classList.remove('active'); }
    });
    const cont = document.getElementById('casillero-items');
    if(!cont) return; cont.innerHTML = '';
    let btnEq = sysLang==='en'?'Equip':'Equipar'; let btnUse = sysLang==='en'?'In Use':'En Uso';
    currentUser.owned[type].forEach(id => {
        let it = FULL_CATALOG[type][id]; if(!it) return;
        let title = it[sysLang] || it.es; let isE = currentUser.equipped[type] === id;
        let btn = isE ? `<button class="card-btn" disabled style="background:var(--success); color:white;">${btnUse}</button>` : `<button class="card-btn" style="background:var(--primary); color:white;" onclick="equipCasillero('${type}','${id}')">${btnEq}</button>`;
        
        let visual = "";
        if(type==='avatar') visual = `<div class="ball-preview" style="background:var(--input-bg); border-color:var(--gold); display:flex;justify-content:center;align-items:center;font-size:1.5rem;">${id}</div>`;
        else visual = type==='ball' ? `<div class="ball-preview" style="background:${it.bg}; border-color:${it.pat || '#fff'}; border-style:dotted;"></div>` : type==='skin' ? `<div class="ball-preview" style="background:${it.c}; border-color:${it.s || '#fff'};"></div>` : type==='stadium' ? `<div class="ball-preview" style="background:${it.c1}; border-color:${it.l || '#fff'}; border-radius:5px;"></div>` : `<div class="ball-preview" style="background:var(--input-bg); border-color:var(--border-color); display:flex;justify-content:center;align-items:center;font-size:1.5rem;">✨</div>`;
        
        cont.innerHTML += `<div class="shop-card owned ${isE?'equipped':''}">${visual}<h3 style="font-size:0.8rem; margin:5px 0; color:var(--text-color);">${title}</h3>${btn}</div>`;
    });
}

function equipCasillero(type, id) { currentUser.equipped[type] = id; saveAccounts(); renderCasillero(type); updateGameStyles(); if(document.getElementById('shop-screen').style.display==='flex') renderShop(); }

let dailyShop = { ball:[], skin:[], stadium:[], avatar:[], effect:[] };
function generateDailyShop() {
    let today = new Date().toDateString(); let seed = 0; for(let i=0; i<today.length; i++) seed += today.charCodeAt(i);
    const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for(let key in dailyShop) {
        let pool = Object.keys(FULL_CATALOG[key]);
        for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        dailyShop[key] = pool.slice(0, 10);
    }
}
generateDailyShop();

function updateShopTimer() {
    let now = new Date(); let mid = new Date(); mid.setHours(24,0,0,0); let diff = mid - now;
    let h = Math.floor(diff/3600000); let m = Math.floor((diff%3600000)/60000); let s = Math.floor((diff%60000)/1000);
    setTxt('shop-rotation-timer', `Cambio en: ${h<10?'0':''}${h}:${m<10?'0':''}${m}:${s<10?'0':''}${s}`);
    if(diff <= 1000) { generateDailyShop(); if(document.getElementById('shop-screen').style.display==='flex') renderShop(); }
}
setInterval(updateShopTimer, 1000);

function scrollToShopSec(id) { let el = document.getElementById('shop-sec-' + id); let container = document.getElementById('shop-all-items'); if(el && container) { container.scrollTo({ top: el.offsetTop - container.offsetTop, behavior: 'smooth' }); } }

function renderShop() { 
    const cont = document.getElementById('shop-all-items'); if(!cont) return; cont.innerHTML = ''; 
    let btnEq = sysLang==='en'?'Equip':'Equipar'; let btnUse = sysLang==='en'?'In Use':'Em Uso'; 
    const sections = [ { id: 'packs', title: sysLang==='en'?'Packs':sysLang==='pt'?'Pacotes':'Sobres 💎' }, { id: 'ball', title: sysLang==='en'?'Balls':sysLang==='pt'?'Bolas':'Balones' }, { id: 'skin', title: sysLang==='en'?'Characters':sysLang==='pt'?'Personagens':'Personajes' }, { id: 'stadium', title: sysLang==='en'?'Stadiums':sysLang==='pt'?'Estádios':'Estadios' }, { id: 'avatar', title: 'Avatares' }, { id: 'effect', title: sysLang==='en'?'Effects':sysLang==='pt'?'Efeitos':'Efectos' } ];
    sections.forEach(sec => {
        let html = `<h3 id="shop-sec-${sec.id}" style="width:100%; color:var(--gold); border-bottom:1px solid var(--border-color); padding-bottom:5px; margin: 20px 0 10px 0; text-align: left;">${sec.title}</h3><div class="shop-grid">`;
        let itemsToShow = sec.id === 'packs' ? Object.keys(FULL_CATALOG.packs) : dailyShop[sec.id];
        itemsToShow.forEach(id => {
            let it = FULL_CATALOG[sec.id][id]; if(!it) return;
            let title = it[sysLang] || it.es;
            if(sec.id === 'packs') {
                html += `<div class="shop-card" style="background:${it.bg}; box-shadow:0 0 15px ${it.bg};"><div style="font-size:2rem; margin:10px 0;">📦</div><h3 style="font-size:0.8rem;color:black;">${title}</h3><button class="card-btn" style="background:black; color:white;" ${currentUser.dia < it.p ? 'disabled' : ''} onclick="openPack('${id}')">💎 ${it.p}</button></div>`;
            } else {
                let isO = currentUser.owned[sec.id].includes(id); let isE = currentUser.equipped[sec.id] === id; 
                let btn = isE ? `<button class="card-btn" disabled style="background:var(--success); color:white;">${btnUse}</button>` : isO ? `<button class="card-btn" style="background:var(--primary); color:white;" onclick="equipI('${sec.id}','${id}')">${btnEq}</button>` : `<button class="card-btn" style="background:var(--input-bg); color:white;" ${currentUser.coins < it.p ? 'disabled' : ''} onclick="buyI('${sec.id}','${id}')">🪙 ${it.p}</button>`; 
                
                let visual = "";
                if(sec.id === 'avatar') visual = `<div class="ball-preview" style="background:var(--input-bg); border-color:var(--gold); display:flex;justify-content:center;align-items:center;font-size:1.5rem;">${id}</div>`;
                else visual = sec.id==='ball' ? `<div class="ball-preview" style="background:${it.bg}; border-color:${it.pat || '#fff'}; border-style:dotted;"></div>` : sec.id==='skin' ? `<div class="ball-preview" style="background:${it.c}; border-color:${it.s || '#fff'};"></div>` : sec.id==='stadium' ? `<div class="ball-preview" style="background:${it.c1}; border-color:${it.l || '#fff'}; border-radius:5px;"></div>` : `<div class="ball-preview" style="background:var(--input-bg); border-color:var(--border-color); display:flex;justify-content:center;align-items:center;font-size:1.5rem;">✨</div>`;
                
                html += `<div class="shop-card ${isO?'owned':''} ${isE?'equipped':''}">${visual}<h3 style="font-size:0.8rem; margin:5px 0; color:var(--text-color);">${title}</h3>${btn}</div>`; 
            }
        }); html += `</div>`; cont.innerHTML += html;
    });
}

function buyI(type, id) { let it = FULL_CATALOG[type][id]; if (currentUser.coins >= it.p) { currentUser.coins -= it.p; currentUser.owned[type].push(id); equipI(type, id); } }
function equipI(type, id) { currentUser.equipped[type] = id; saveAccounts(); renderShop(); updateGameStyles(); }
function openShop() { generateDailyShop(); openScreen('shop-screen'); renderShop(); setTimeout(()=> { let c = document.getElementById('shop-all-items'); if(c) c.scrollTop = 0; }, 100); }

let pendingReward = null;
function openPack(type) {
    let cost = FULL_CATALOG.packs[type].p; if (currentUser.dia < cost) return alert("No tienes diamantes suficientes.");
    currentUser.dia -= cost; saveAccounts();
    let pool = [];
    for(let id in FULL_CATALOG.ball) if(!currentUser.owned.ball.includes(id)) pool.push({c:'ball', id:id});
    for(let id in FULL_CATALOG.skin) if(!currentUser.owned.skin.includes(id)) pool.push({c:'skin', id:id});
    if(pool.length > 0) { let r = pool[Math.floor(Math.random() * pool.length)]; currentUser.owned[r.c].push(r.id); pendingReward = { type: 'item', text: FULL_CATALOG[r.c][r.id].es }; } 
    else { let cCoins = cost * 20; currentUser.coins += cCoins; pendingReward = { type: 'coins', text: `+${cCoins} 🪙` }; }
    saveAccounts(); closeScreen('shop-screen');
    document.getElementById('pack-card').style.display = 'flex'; document.getElementById('pack-reveal').style.display = 'none'; document.getElementById('pack-close-btn').style.display = 'none'; setTxt('pack-title', "TOCA PARA ABRIR");
    openScreen('pack-animation-screen');
}
function revealPack() { if(!pendingReward) return; document.getElementById('pack-card').style.display = 'none'; document.getElementById('pack-reveal').style.display = 'flex'; setTxt('pack-reveal-text', pendingReward.text); setTxt('pack-title', "¡RECOMPENSA!"); document.getElementById('pack-close-btn').style.display = 'block'; }
function closePack() { closeScreen('pack-animation-screen'); pendingReward = null; openShop(); }

function switchFriendsTab(tabName) { 
    ['list', 'req', 'add'].forEach(t => { 
        let ct = document.getElementById('fr-content-' + t); if(ct) ct.style.display = 'none'; 
        let tb = document.getElementById('tab-fr-' + t); if(tb) tb.classList.remove('active'); 
    }); 
    let ctOpen = document.getElementById('fr-content-' + tabName); if(ctOpen) ctOpen.style.display = 'block'; 
    let tbOpen = document.getElementById('tab-fr-' + tabName); if(tbOpen) tbOpen.classList.add('active'); 
}

function renderFriends() {
    const reqCont = document.getElementById('pending-list'); const frCont = document.getElementById('friends-list'); if(reqCont) reqCont.innerHTML=''; if(frCont) frCont.innerHTML='';
    setTxt('fr-count', currentUser.friends.length); setTxt('req-count', currentUser.requests.length);
    if(currentUser.requests.length === 0) { 
        if(reqCont) reqCont.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);"><div style="font-size:3rem; margin-bottom:10px;">📥</div>No tienes solicitudes.</div>`; 
    } else { 
        currentUser.requests.forEach((req, i) => { 
            let btnAcc = currentUser.optControls ? '✔️' : 'Aceptar';
            let btnRej = currentUser.optControls ? '❌' : 'Rechazar';
            if(reqCont) reqCont.innerHTML += `<div class="friend-item"><div class="friend-avatar" style="background:#1e40af; color:white;">${req.name.charAt(0)}<div class="status-circle"></div></div><div class="friend-info"><div class="friend-name-line"><div class="friend-name">${req.name}</div></div><div class="friend-status-text">Código: ${req.code}</div></div><div style="display:flex; gap:5px;"><button class="btn-small" onclick="acceptFriend(${i})" style="background:var(--success);">${btnAcc}</button><button class="btn-small" onclick="rejectFriend(${i})" style="background:var(--danger);">${btnRej}</button></div></div>`; 
        }); 
    }
    if(currentUser.friends.length === 0) { if(frCont) frCont.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);"><div style="font-size:3rem; margin-bottom:10px;">👥</div>No tienes amigos aún.</div>`; } 
    else { 
        currentUser.friends.forEach(fr => { 
            // MEJORA: El botón muestra 'Invitar' solo en el contexto de Lobby
            let btnLabel = (friendScreenContext === 'lobby') ? 'Invitar' : 'Perfil';
            if(frCont) frCont.innerHTML += `<div class="friend-item" style="cursor:pointer;" onclick="openFriendProfile('${fr.code}', '${fr.name}', '${fr.docId}')">
                <div class="friend-avatar" style="border:2px solid var(--gold);">${fr.avatar || '⚽'}</div>
                <div class="friend-info" style="flex:1;">
                    <div class="friend-name-line"><div class="friend-name">${fr.name}</div><div class="friend-stars">★</div></div>
                    <div class="friend-status-text">Toca para ver perfil</div>
                </div>
                <button class="btn-small" style="background:var(--primary)">${btnLabel}</button>
            </div>`; 
        }); 
    }
}

function copyText(text) { navigator.clipboard.writeText(text).then(()=>alert("¡Copiado!")).catch(e=>console.error(e)); }
function copyMyCode() { copyText(currentUser.code); }
function copyInviteLink() { let link = document.getElementById('invite-link-input'); if(link) copyText(link.value); }
function shareInviteLink() { let link = document.getElementById('invite-link-input'); if (navigator.share && link) { navigator.share({ title: 'FutCard Play', text: '¡Agrégame!', url: link.value }); } else alert("No soportado."); }
function toggleQR() { const box = document.getElementById('qr-display-box'); const btn = document.getElementById('btn-toggle-qr'); if(box && btn) { if(box.style.display === 'none') { box.style.display = 'flex'; btn.innerHTML = '🙈 Ocultar'; } else { box.style.display = 'none'; btn.innerHTML = '👁️ Mostrar'; } } }
function handleQRScan(e) { alert("Escaneo simulado con éxito."); }

function openScreen(id) { let scr = document.getElementById(id); if(scr) { scr.style.display = 'flex'; setTimeout(() => scr.style.opacity = '1', 10); } }
function closeScreen(id) { let scr = document.getElementById(id); if(scr) { scr.style.opacity = '0'; setTimeout(() => scr.style.display = 'none', 300); } }

function goHome() { 
    document.querySelectorAll('.overlay-screen').forEach(el => closeScreen(el.id)); 
    let mi = document.getElementById('match-interface'); if(mi) mi.style.display = 'none'; 
    let ls = document.getElementById('lobby-screen'); if(ls) ls.style.display = 'none';
    let ds = document.getElementById('dashboard-screen'); if(ds) { ds.style.display = 'flex'; setTimeout(() => ds.style.opacity = '1', 10); } 
    let bn = document.getElementById('bottom-nav'); if(bn) bn.style.display = 'flex'; 
    let he = document.getElementById('hud-edit-overlay'); if(he) he.style.display = 'none'; 
    applyProfile(); gameState = 'menu'; 
}

let lobbyState = { players: 1, isReady: false, guestReady: false, mode: 'pve', type: 'normal' };

function openLobby() {
    let ds = document.getElementById('dashboard-screen'); if(ds) ds.style.opacity = '0';
    setTimeout(() => {
        if(ds) ds.style.display = 'none';
        let ls = document.getElementById('lobby-screen'); if(ls) { ls.style.display = 'flex'; setTimeout(()=>ls.style.opacity='1', 10); }
    }, 300);
    if(lobbyState.players === 1) {
        document.getElementById('lobby-p2-oval').classList.add('empty'); document.getElementById('lobby-p2-av').classList.add('empty'); document.getElementById('lobby-p2-av').classList.remove('guest');
        setTxt('lobby-p2-name', '---'); setTxt('lobby-p2-status', ''); setTxt('lobby-mode-display', '👤 Normal vs IA');
        lobbyState.mode = 'pve'; lobbyState.type = 'normal';
    }
    updateLobbyUI();
}

function setLobbyMode(mode, type, nameText) { lobbyState.mode = mode; lobbyState.type = type; setTxt('lobby-mode-display', nameText); closeScreen('mode-select-screen'); if (mode === 'pve') { openScreen('diff-select-screen'); } }
function startAI(diff) { aiDifficulty = diff; closeScreen('diff-select-screen'); }

function updateLobbyUI() {
    let btn = document.getElementById('btn-lobby-action');
    if (lobbyState.players === 1) { btn.className = 'play-btn-ready start'; btn.innerText = '¡JUGAR!'; setTxt('lobby-p1-status', ''); } 
    else { if (lobbyState.isReady) { btn.className = 'play-btn-ready cancel'; btn.innerText = 'CANCELAR'; setTxt('lobby-p1-status', 'LISTO'); document.getElementById('lobby-p1-status').style.color = 'var(--success)'; } else { btn.className = 'play-btn-ready ready'; btn.innerText = 'LISTO'; setTxt('lobby-p1-status', 'ESPERANDO'); document.getElementById('lobby-p1-status').style.color = 'var(--gold)'; } }
}

function handleLobbyAction() {
    let btn = document.getElementById('btn-lobby-action');
    if (lobbyState.players === 1) { btn.innerText = "CARGANDO..."; setTimeout(() => { executeStartGame(lobbyState.mode, lobbyState.type); }, 500); } 
    else {
        lobbyState.isReady = !lobbyState.isReady; updateLobbyUI();
        if (lobbyState.isReady && !lobbyState.guestReady) { setTimeout(() => { lobbyState.guestReady = true; setTxt('lobby-p2-status', 'LISTO'); document.getElementById('lobby-p2-status').style.color = 'var(--success)'; checkAllReady(); }, 1500); } else { checkAllReady(); }
    }
}

function checkAllReady() { if (lobbyState.players > 1 && lobbyState.isReady && lobbyState.guestReady) { let btn = document.getElementById('btn-lobby-action'); btn.className = 'play-btn-ready start'; btn.innerText = "INICIANDO..."; setTimeout(() => { executeStartGame(lobbyState.mode, lobbyState.type, lobbyState.guestName); lobbyState.isReady = false; lobbyState.guestReady = false; lobbyState.players = 1; }, 1500); } }

function executeStartGame(mode, type, oppName = null) {
    let ls = document.getElementById('lobby-screen'); if(ls) ls.style.display = 'none';
    let bn = document.getElementById('bottom-nav'); if(bn) bn.style.display = 'none';
    let mi = document.getElementById('match-interface'); if(mi) mi.style.display = 'flex';
    setTxt('name2-display', oppName ? oppName : (mode.includes('pvp') || mode.includes('online') ? 'Rival' : 'IA'));
    gameMode = mode; matchType = type; _initMatch();
}

const canvas = document.getElementById('gameCanvas'); const ctx = canvas ? canvas.getContext('2d') : null;
const wCanv = document.getElementById('weather-overlay'); const wCtx = wCanv ? wCanv.getContext('2d') : null;
let FRICTION = 0.93; let BALL_FRICTION = 0.985; const ACCELERATION = 0.25; const MAX_SPEED = 4.5; const KICK_FORCE = 1.5; const RESTITUTION = 0.8;
let score = {p1:0, p2:0}, keys = {}, prevKeys = {}, gameMode = 'pvp', gameState = 'menu';
let isRaining = false, rainDrops = [], replayBuffer = [], replayIndex = 0, goalParticles = [], footprints = [];
let stealCooldown = 0; let aiDifficulty = 5;

function showChaosBanner(key) {
    let b = document.getElementById('chaos-banner');
    if(!b) return; b.innerText = chaosNames[key]; b.classList.add('show');
    setTimeout(() => b.classList.remove('show'), 3000);
}

function clearChaosEvent() {
    chaosActiveEvent = null; mudPuddles = []; portals = []; b.radius = 10; iceMode = false;
    let cb = document.getElementById('chaos-banner'); if(cb) cb.classList.remove('show');
}

function triggerRandomChaosEvent() {
    let events = ['wind', 'mud', 'portals', 'giant_ball', 'ice'];
    chaosActiveEvent = events[Math.floor(Math.random() * events.length)];
    chaosEventDuration = 60 * 15; chaosTimer = 60 * 5; 
    if(chaosActiveEvent === 'wind') {
        let a = Math.random() * Math.PI * 2; wind.vx = Math.cos(a) * 4; wind.vy = Math.sin(a) * 4;
    } else if(chaosActiveEvent === 'mud') {
        mudPuddles = []; for(let i=0; i<4; i++) mudPuddles.push({x: 100+Math.random()*800, y: 50+Math.random()*400, r: 45});
    } else if(chaosActiveEvent === 'portals') {
        portals = [{x: 200, y: 100 + Math.random()*300}, {x: 800, y: 100 + Math.random()*300}];
    } else if(chaosActiveEvent === 'giant_ball') {
        b.radius = 25; 
    } else if(chaosActiveEvent === 'ice') {
        iceMode = true;
    }
    showChaosBanner(chaosActiveEvent);
}

function updateChaos() {
    if(matchType !== 'caos') return;
    if(chaosTimer > 0) chaosTimer--;
    if(chaosEventDuration > 0) {
        chaosEventDuration--;
        if(chaosEventDuration === 0) clearChaosEvent();
    }
    if(chaosTimer === 0 && chaosEventDuration === 0) { triggerRandomChaosEvent(); }
    if(chaosActiveEvent === 'wind') { if(!b.owner && (Math.abs(b.vx)>0.5 || Math.abs(b.vy)>0.5)) { b.vx += wind.vx * 0.05; b.vy += wind.vy * 0.05; } }
    if(chaosActiveEvent === 'portals') {
        if(portalCooldown > 0) portalCooldown--;
        if(portalCooldown <= 0 && portals.length === 2 && !b.owner) {
            let dA = Math.hypot(b.x - portals[0].x, b.y - portals[0].y);
            let dB = Math.hypot(b.x - portals[1].x, b.y - portals[1].y);
            if(dA < 30) { b.x = portals[1].x; b.y = portals[1].y; portalCooldown = 60; spawnPart(portals[1].x); }
            else if(dB < 30) { b.x = portals[0].x; b.y = portals[0].y; portalCooldown = 60; spawnPart(portals[0].x); }
        }
    }
}

function drawChaos() {
    if(!ctx) return;
    if(chaosActiveEvent === 'mud') {
        ctx.fillStyle = "rgba(74, 48, 24, 0.85)";
        for(let m of mudPuddles) { ctx.beginPath(); ctx.ellipse(m.x, m.y, m.r, m.r*0.7, 0, 0, Math.PI*2); ctx.fill(); }
    } else if(chaosActiveEvent === 'portals') {
        let t = Date.now() * 0.005;
        for(let i=0; i<portals.length; i++) {
            let p = portals[i]; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * (i===0?1:-1));
            ctx.strokeStyle = i===0 ? "#a855f7" : "#f97316"; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*1.5); ctx.stroke();
            ctx.fillStyle = i===0 ? "rgba(168, 85, 247, 0.3)" : "rgba(249, 115, 22, 0.3)";
            ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI*2); ctx.fill(); ctx.restore();
        }
    } else if(chaosActiveEvent === 'wind') {
        ctx.save(); ctx.translate(500, 250); ctx.globalAlpha = 0.2;
        let ang = Math.atan2(wind.vy, wind.vx); ctx.rotate(ang); ctx.fillStyle = "white";
        ctx.beginPath(); ctx.moveTo(-50, -20); ctx.lineTo(10, -20); ctx.lineTo(10, -40); ctx.lineTo(60, 0); ctx.lineTo(10, 40); ctx.lineTo(10, 20); ctx.lineTo(-50, 20); ctx.fill(); ctx.restore();
    } else if(chaosActiveEvent === 'ice') {
        ctx.fillStyle = "rgba(224, 242, 254, 0.25)"; ctx.fillRect(0,0,1000,500);
    }
}

function toggleEmoteMenu() { if(gameState === 'hud_edit') return; let m = document.getElementById('emote-menu'); if(m) m.style.display = m.style.display === 'flex' ? 'none' : 'flex'; }
function sendEmote(emoji) { p1.emote = emoji; p1.emoteT = 120; let m = document.getElementById('emote-menu'); if(m) m.style.display='none'; }

let joystickData = { active: false, nx: 0, ny: 0, angle: 0, force: 0 };
const joyBase = document.getElementById('virtual-joystick'); const joyKnob = document.getElementById('joystick-knob'); let joyBaseRect = null; let lastJoyTap = 0;
function handleJoyStart(e) { if(gameState === 'hud_edit') return; if(!joyBase) return; e.preventDefault(); let now = Date.now(); if(now - lastJoyTap < 300 && p1.stamina >= 25 && stealCooldown <= 0) { p1.dashT = 10; p1.stamina -= 25; } lastJoyTap = now; joystickData.active = true; joyBaseRect = joyBase.getBoundingClientRect(); handleJoyMove(e); }
function handleJoyMove(e) { if(gameState === 'hud_edit') return; if (!joystickData.active || !joyBaseRect) return; e.preventDefault(); let touch = e.touches ? e.touches[0] : e; let dx = touch.clientX - (joyBaseRect.left + joyBaseRect.width / 2); let dy = touch.clientY - (joyBaseRect.top + joyBaseRect.height / 2); let dist = Math.hypot(dx, dy); let maxD = joyBaseRect.width / 2 - 27; let ang = Math.atan2(dy, dx); if (dist > maxD) { dx = Math.cos(ang) * maxD; dy = Math.sin(ang) * maxD; dist = maxD; } if(joyKnob) joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`; joystickData.nx = Math.cos(ang); joystickData.ny = Math.sin(ang); joystickData.angle = ang; joystickData.force = dist / maxD; }
function handleJoyEnd(e) { if(gameState === 'hud_edit') return; e.preventDefault(); joystickData.active = false; joystickData.nx = 0; joystickData.ny = 0; joystickData.force = 0; if(joyKnob) joyKnob.style.transform = `translate(-50%, -50%)`; }
if(joyBase) { joyBase.addEventListener('touchstart', handleJoyStart, {passive: false}); joyBase.addEventListener('touchmove', handleJoyMove, {passive: false}); joyBase.addEventListener('touchend', handleJoyEnd, {passive: false}); joyBase.addEventListener('touchcancel', handleJoyEnd, {passive: false}); }

function bindAimTouch(id, key) { 
    let el = document.getElementById(id); if(!el) return; let rect = null, isDrag = false; 
    el.addEventListener('touchstart', e => { if(gameState === 'hud_edit') return; e.preventDefault(); keys[key] = true; rect = el.getBoundingClientRect(); isDrag = false; }, {passive: false}); 
    el.addEventListener('touchmove', e => { if(gameState === 'hud_edit') return; if(!keys[key]) return; e.preventDefault(); let touch = e.touches ? e.touches[0] : e; let dx = touch.clientX - (rect.left + rect.width/2), dy = touch.clientY - (rect.top + rect.height/2); if(Math.hypot(dx,dy) > 10) { p1.aimAngle = Math.atan2(dy,dx); isDrag = true; } }, {passive: false}); 
    const endFn = e => { if(gameState === 'hud_edit') return; e.preventDefault(); keys[key] = false; if(!isDrag) p1.aimAngle = p1.a; }; 
    el.addEventListener('touchend', endFn, {passive: false}); el.addEventListener('touchcancel', endFn, {passive: false}); 
}
bindAimTouch('btn-kick', 'shift'); bindAimTouch('btn-pass', 'space'); bindAimTouch('btn-sprint', 'Alt');

function updateGameStyles() { if(canvas && currentUser && FULL_CATALOG.stadium) { let stad = FULL_CATALOG.stadium[currentUser.equipped.stadium]; if(stad) canvas.style.backgroundColor = stad.c1; } }

class PlayerEntity {
    constructor(x, y, r) { this.x=x; this.y=y; this.vx=0; this.vy=0; this.radius=r; this.a=0; this.aimAngle=0; this.stamina=100; this.dashT=0; this.emote=''; this.emoteT=0; }
    drawP(col, skin) { 
        if(!ctx) return; ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.a); 
        ctx.beginPath(); ctx.ellipse(0,0,this.radius,this.radius*0.75,0,0,Math.PI*2); ctx.fillStyle=col; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle="rgba(0,0,0,0.6)"; ctx.stroke(); 
        ctx.beginPath(); ctx.arc(this.radius*0.2,0,this.radius*0.55,0,Math.PI*2); ctx.fillStyle=skin; ctx.fill(); ctx.stroke(); 
        ctx.beginPath(); ctx.arc(this.radius*0.2,0,this.radius*0.55,-Math.PI/2,Math.PI/2,true); ctx.fillStyle="rgba(0,0,0,0.8)"; ctx.fill(); 
        ctx.restore(); ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(this.x - 15, this.y - this.radius - 12, 30, 4);
        ctx.fillStyle = this.stamina > 30 ? "#22c55e" : "#ef4444"; ctx.fillRect(this.x - 15, this.y - this.radius - 12, 30 * (this.stamina/100), 4);
    }
}
class BallEntity {
    constructor(x, y, r) { this.x=x; this.y=y; this.vx=0; this.vy=0; this.radius=r; this.a=0; this.owner=null; }
    drawB() { 
        if(!ctx || !currentUser || !FULL_CATALOG.ball) return; let spd=Math.sqrt(this.vx*this.vx+this.vy*this.vy); this.a+=spd*0.05*Math.sign(this.vx||1); 
        let cfg = FULL_CATALOG.ball[currentUser.equipped.ball]; if(!cfg) return;
        ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.a); if(cfg.g){ctx.shadowBlur=15; ctx.shadowColor=cfg.g;} 
        ctx.beginPath(); ctx.arc(0,0,this.radius,0,Math.PI*2); ctx.fillStyle=cfg.bg; ctx.fill(); ctx.shadowBlur=0; 
        ctx.fillStyle=cfg.pat; for(let i=0;i<3;i++){let an=i*((Math.PI*2)/3); ctx.beginPath(); ctx.arc(Math.cos(an)*this.radius*0.4,Math.sin(an)*this.radius*0.4,this.radius*0.35,0,Math.PI*2); ctx.fill();} 
        ctx.lineWidth=1.5; ctx.strokeStyle="rgba(0,0,0,0.8)"; ctx.stroke(); ctx.restore(); 
    }
}
const b = new BallEntity(500,250,10); const p1 = new PlayerEntity(250,250,20); const p2 = new PlayerEntity(750,250,20); 
const p3 = new PlayerEntity(250,100,20); const p4 = new PlayerEntity(750,100,20); 

function _initMatch() { 
    if(gameState === 'hud_edit') return;
    score={p1:0,p2:0}; setTxt('score1', 0); setTxt('score2', 0); currentHalf=1; currentTime=90; updateGameStyles(); resetPositions(); 
    matchStats = {p1Pos:0, p2Pos:0, p1Sho:0, p2Sho:0, p1Stl:0, p2Stl:0};
    clearChaosEvent(); if(matchType === 'caos') chaosTimer = 60 * 5; 
    isRaining=Math.random()<0.3; FRICTION=isRaining?0.96:0.93; BALL_FRICTION=isRaining?0.99:0.985; rainDrops=[]; footprints=[];
    if(isRaining) for(let i=0;i<100;i++) rainDrops.push({x:Math.random()*1000,y:Math.random()*500,l:Math.random()*2+1,v:Math.random()*5+5}); 
    gameState='playing'; startTimer(); 
}

function resetPositions() { 
    b.x=500; b.y=250; b.vx=0; b.vy=0; b.owner=null; 
    p1.x=250; p1.y=250; p1.vx=0; p1.vy=0; p1.a=0; p1.aimAngle=0; p1.stamina=100; p1.emoteT=0;
    p2.x=750; p2.y=250; p2.vx=0; p2.vy=0; p2.a=Math.PI; p2.aimAngle=Math.PI; p2.stamina=100; p2.emoteT=0;
    if(gameMode.includes('2v2')){ p3.x=250; p3.y=100; p3.vx=0; p3.vy=0; p4.x=750; p4.y=100; p4.vx=0; p4.vy=0; p4.a=Math.PI;}
    stealCooldown=0; for(let k in keys) keys[k]=false; prevKeys={}; 
}

function updatePossession() {
    if(stealCooldown > 0) stealCooldown--;
    let players = gameMode.includes('2v2') ? [p1,p2,p3,p4] : [p1,p2];
    if(!b.owner && stealCooldown <= 0) {
        let closest = null; let minDist = 999;
        players.forEach(p => { let d = Math.hypot(b.x - p.x, b.y - p.y); if(d < p.radius + b.radius + 5 && d < minDist) { minDist = d; closest = p; } });
        if(closest) b.owner = closest;
    }
    if(b.owner) {
        if(b.owner === p1) matchStats.p1Pos++; else if(b.owner === p2) matchStats.p2Pos++;
        players.forEach(p => {
            if(p !== b.owner && stealCooldown <= 0) {
                let d = Math.hypot(p.x - b.owner.x, p.y - b.owner.y);
                if(d < p.radius + b.owner.radius) { 
                    if(b.owner===p1 && p===p2) matchStats.p2Stl++;
                    if(b.owner===p2 && p===p1) matchStats.p1Stl++;
                    b.owner = p; stealCooldown = 30; 
                }
            }
        });
        b.x = b.owner.x + Math.cos(b.owner.a) * (20 + (b.radius - 10)); b.y = b.owner.y + Math.sin(b.owner.a) * (20 + (b.radius - 10)); b.vx = b.owner.vx; b.vy = b.owner.vy; 
    }
}

function shootBall(p, angle, power) { 
    if(p===p1 && Math.cos(angle)>0) matchStats.p1Sho++; 
    if(p===p2 && Math.cos(angle)<0) matchStats.p2Sho++;
    let massFactor = chaosActiveEvent === 'giant_ball' ? 0.6 : 1;
    b.x = p.x + Math.cos(angle) * (25 + (b.radius - 10)); b.y = p.y + Math.sin(angle) * (25 + (b.radius - 10)); b.vx = Math.cos(angle) * (power * massFactor); b.vy = Math.sin(angle) * (power * massFactor); b.owner = null; stealCooldown = 15; 
}

let goalScorer = '';
function chkWall(e) { 
    let isG=false, gT=180, gB=320; let isBall = (e === b);
    if(e.x-e.radius<0) { if(isBall && e.y>gT && e.y<gB) { score.p2++; isG=true; spawnPart(10); goalScorer='p2'; } else if(!isBall || !b.owner) { e.x=e.radius; e.vx*=-RESTITUTION; } } 
    if(e.x+e.radius>1000) { if(isBall && e.y>gT && e.y<gB) { score.p1++; currentUser.coins+=10; isG=true; spawnPart(990); goalScorer='p1'; addStat('goals',1); addXP(20); } else if(!isBall || !b.owner) { e.x=1000-e.radius; e.vx*=-RESTITUTION; } } 
    if(e.y-e.radius<0) { if(!isBall || !b.owner) { e.y=e.radius; e.vy*=-RESTITUTION; } } 
    if(e.y+e.radius>500) { if(!isBall || !b.owner) { e.y=500-e.radius; e.vy*=-RESTITUTION; } } 
    if(isG && gameState==='playing') { gameState='replay_trans'; setTxt('score1', score.p1); setTxt('score2', score.p2); setTimeout(()=>{ gameState='replay'; replayIndex=0; let rb = document.getElementById('replay-badge'); if(rb) rb.style.display='block'; }, 500); } 
}

function drawPitch() { 
    if(!ctx) return; let stad = FULL_CATALOG.stadium[currentUser.equipped.stadium]; if(!stad) return; let lCol=stad.l; ctx.clearRect(0,0,1000,500); 
    let strW=100; for(let i=0;i<1000;i+=strW){ctx.fillStyle=(i/strW)%2===0?stad.c1:stad.c2; ctx.fillRect(i,0,strW,500);} 
    ctx.fillStyle = "#000000"; for(let i=footprints.length-1; i>=0; i--) { let f = footprints[i]; f.a -= 0.01; if(f.a <= 0) { footprints.splice(i, 1); continue; } ctx.globalAlpha = f.a; ctx.beginPath(); ctx.arc(f.x, f.y, 5, 0, Math.PI*2); ctx.fill(); } ctx.globalAlpha = 1.0;
    ctx.strokeStyle=lCol; ctx.lineWidth=3; ctx.strokeRect(0,0,1000,500); ctx.beginPath(); ctx.moveTo(500,0); ctx.lineTo(500,500); ctx.stroke(); ctx.beginPath(); ctx.arc(500,250,60,0,Math.PI*2); ctx.stroke(); ctx.beginPath(); ctx.arc(500,250,4,0,Math.PI*2); ctx.fillStyle=lCol; ctx.fill(); 
    ctx.strokeRect(0,120,120,260); ctx.strokeRect(0,180,40,140); ctx.beginPath(); ctx.arc(90,250,3,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(90,250,60,-Math.PI/3.5,Math.PI/3.5); ctx.stroke(); 
    ctx.strokeRect(880,120,120,260); ctx.strokeRect(960,180,40,140); ctx.beginPath(); ctx.arc(910,250,3,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(910,250,60,Math.PI-Math.PI/3.5,Math.PI+Math.PI/3.5); ctx.stroke(); 
    ctx.fillStyle="rgba(0,0,0,0.3)"; ctx.fillRect(0,200,15,100); ctx.fillRect(985,200,15,100); 
}

function drawAimArrow() { if(b.owner === p1 && (keys['shift'] || keys['space'])) { ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p1.x + Math.cos(p1.aimAngle)*60, p1.y + Math.sin(p1.aimAngle)*60); ctx.strokeStyle = keys['shift'] ? "rgba(255, 60, 60, 0.8)" : "rgba(60, 150, 255, 0.8)"; ctx.lineWidth = 4; ctx.stroke(); ctx.beginPath(); ctx.arc(p1.x + Math.cos(p1.aimAngle)*60, p1.y + Math.sin(p1.aimAngle)*60, 5, 0, Math.PI*2); ctx.fillStyle = keys['shift'] ? "rgba(255, 60, 60, 1)" : "rgba(60, 150, 255, 1)"; ctx.fill(); } }
function drawWeather() { if(!wCtx) return; wCtx.clearRect(0,0,1000,500); if(!isRaining) return; wCtx.strokeStyle="rgba(255,255,255,0.3)"; wCtx.lineWidth=1; wCtx.beginPath(); rainDrops.forEach(r=>{ r.y+=r.v; r.x+=1; if(r.y>500){r.y=-10; r.x=Math.random()*1000;} wCtx.moveTo(r.x,r.y); wCtx.lineTo(r.x+1,r.y+r.v*r.l); }); wCtx.stroke(); }
function spawnPart(x) { let effId = currentUser.equipped.effect; if(effId==='ninguno') return; for(let i=0;i<50;i++){ let col = `hsl(${Math.random()*360},100%,50%)`; if(effId==='fuego') col = Math.random()>0.5?'#ef4444':'#f97316'; else if(effId==='rayos') col = Math.random()>0.5?'#e0f2fe':'#38bdf8'; else if(effId==='burbu') col = 'rgba(255,255,255,0.7)'; else if(effId==='coraz') col = '#f472b6'; else if(effId==='estrell') col = '#facc15'; else if(effId==='humo') col = 'rgba(148,163,184,0.6)'; else if(effId==='oro_ef') col = '#fef08a'; else if(effId==='pixel') col = Math.random()>0.5?'#22c55e':'#16a34a'; goalParticles.push({x:x, y:250+(Math.random()*80-40), vx:(Math.random()-0.5)*10, vy:(Math.random()-0.5)*10, life:1, c:col}); } }
function drawPart() { if(!ctx) return; for(let i=goalParticles.length-1; i>=0; i--){ let p=goalParticles[i]; p.x+=p.vx; p.y+=p.vy; p.life-=0.02; if(p.life<=0){goalParticles.splice(i,1);continue;} ctx.globalAlpha=p.life; ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2); ctx.fill(); ctx.globalAlpha=1; } }
function recFrame() { if(replayBuffer.length>150) replayBuffer.shift(); let frame = {bx:b.x, by:b.y, p1x:p1.x, p1y:p1.y, p1a:p1.a, p2x:p2.x, p2y:p2.y, p2a:p2.a}; if(gameMode.includes('2v2')){ frame.p3x=p3.x; frame.p3y=p3.y; frame.p3a=p3.a; frame.p4x=p4.x; frame.p4y=p4.y; frame.p4a=p4.a; } replayBuffer.push(frame); }
function drawFrame(f) { 
    let sk = FULL_CATALOG.skin[currentUser.equipped.skin]; if(!sk) return;
    b.x=f.bx; b.y=f.by; p1.x=f.p1x; p1.y=f.p1y; p1.a=f.p1a; p2.x=f.p2x; p2.y=f.p2y; p2.a=f.p2a; 
    if(f.p3x) {p3.x=f.p3x; p3.y=f.p3y; p3.a=f.p3a; p4.x=f.p4x; p4.y=f.p4y; p4.a=f.p4a;}
    drawPitch(); drawChaos(); b.drawB(); p1.drawP(sk.c, sk.s); p2.drawP('#3b82f6', '#d2dae2'); 
    if(gameMode.includes('2v2')){ p3.drawP('#10b981', '#fcd34d'); p4.drawP('#8b5cf6', '#cbd5e1'); }
}

function drawRadar() {
    if(!ctx) return; let rw = 200, rh = 100, rx = 400, ry = 10;
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2; ctx.strokeRect(rx, ry, rw, rh);
    ctx.beginPath(); ctx.moveTo(rx+rw/2, ry); ctx.lineTo(rx+rw/2, ry+rh); ctx.stroke();
    ctx.beginPath(); ctx.arc(rx+rw/2, ry+rh/2, 15, 0, Math.PI*2); ctx.stroke();
    let drawD = (x,y,c,s) => { ctx.fillStyle=c; ctx.beginPath(); ctx.arc(rx+(x*0.2), ry+(y*0.2), s, 0, Math.PI*2); ctx.fill(); };
    drawD(p1.x, p1.y, 'red', 3); drawD(p2.x, p2.y, '#3b82f6', 3);
    if(gameMode.includes('2v2')){ drawD(p3.x, p3.y, '#10b981', 3); drawD(p4.x, p4.y, '#8b5cf6', 3); }
    drawD(b.x, b.y, 'yellow', 2.5);
}

function drawEmotes() {
    if(!ctx) return;
    [p1,p2].forEach(p => {
        if(p.emoteT > 0) {
            ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.beginPath(); ctx.arc(p.x+25, p.y-35, 15, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "black"; ctx.font = "18px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.emote, p.x+25, p.y-35);
            p.emoteT--;
        }
    });
}

function handleInput() {
    if(gameState !== 'playing') return;
    if(keys['space'] && b.owner !== p1) { p1.vx *= 0.8; p1.vy *= 0.8; }
    let isSprint = keys['Alt'] && b.owner !== p1 && p1.stamina > 0;
    let acc = isSprint ? ACCELERATION * 2 : ACCELERATION; let maxS = isSprint ? MAX_SPEED * 1.5 : MAX_SPEED;
    if(isSprint) p1.stamina -= 1.0; else if(p1.stamina < 100) p1.stamina += 0.5;
    if (joystickData.active) {
        p1.a = joystickData.angle; if(!keys['shift'] && !keys['space']) p1.aimAngle = p1.a;
        p1.vx += joystickData.nx * (acc * joystickData.force); p1.vy += joystickData.ny * (acc * joystickData.force);
        let cSpeed = Math.hypot(p1.vx, p1.vy); if(cSpeed > maxS) { p1.vx = (p1.vx / cSpeed) * maxS; p1.vy = (p1.vy / cSpeed) * maxS; }
    } else {
        let iX = 0, iY = 0; if(keys['w']) iY -= 1; if(keys['s']) iY += 1; if(keys['a']) iX -= 1; if(keys['d']) iX += 1;
        if(iX !== 0 || iY !== 0) { p1.a = Math.atan2(iY, iX); if(!keys['shift'] && !keys['space']) p1.aimAngle = p1.a; }
        if(keys['w'] && p1.vy > -maxS) p1.vy -= acc; if(keys['s'] && p1.vy < maxS) p1.vy += acc; if(keys['a'] && p1.vx > -maxS) p1.vx -= acc; if(keys['d'] && p1.vx < maxS) p1.vx += acc;
    }
    if (p1.dashT > 0) { p1.dashT--; p1.vx += Math.cos(p1.a) * 3; p1.vy += Math.sin(p1.a) * 3; }
    if (Math.hypot(p1.vx, p1.vy) > 2 && Math.random() < 0.3) footprints.push({x: p1.x, y: p1.y, a: isRaining ? 0.3 : 0.1});
    if (Math.hypot(p2.vx, p2.vy) > 2 && Math.random() < 0.3) footprints.push({x: p2.x, y: p2.y, a: isRaining ? 0.3 : 0.1});
    if (!keys['shift'] && prevKeys['shift'] && b.owner === p1) shootBall(p1, p1.aimAngle, 18);
    if (!keys['space'] && prevKeys['space'] && b.owner === p1) shootBall(p1, p1.aimAngle, 9);
    if(gameMode === 'pvp') { 
        let iX2 = 0, iY2 = 0; if(keys['ArrowUp']) iY2 -= 1; if(keys['ArrowDown']) iY2 += 1; if(keys['ArrowLeft']) iX2 -= 1; if(keys['ArrowRight']) iX2 += 1;
        if(iX2 !== 0 || iY2 !== 0) { p2.aimAngle = Math.atan2(iY2, iX2); p2.a = p2.aimAngle; }
        if(keys['ArrowUp'] && p2.vy > -MAX_SPEED) p2.vy -= ACCELERATION; if(keys['ArrowDown'] && p2.vy < MAX_SPEED) p2.vy += ACCELERATION; if(keys['ArrowLeft'] && p2.vx > -MAX_SPEED) p2.vx -= ACCELERATION; if(keys['ArrowRight'] && p2.vx < MAX_SPEED) p2.vx += ACCELERATION; 
        if(!keys['Enter'] && prevKeys['Enter'] && b.owner === p2) shootBall(p2, p2.aimAngle, 18); if(!keys['ShiftRight'] && prevKeys['ShiftRight'] && b.owner === p2) shootBall(p2, p2.aimAngle, 9);
    }
}

function runAI(aiP, isDefense) {
    let aiAcc = ACCELERATION * (0.3 + aiDifficulty * 0.1); let aiMaxS = MAX_SPEED * (0.4 + aiDifficulty * 0.08);
    if(b.owner === aiP) {
        let targetY = 250, targetX = isDefense ? 0 : 1000;
        let dy = targetY - aiP.y, dx = targetX - aiP.x; aiP.aimAngle = Math.atan2(dy, dx); aiP.a = aiP.aimAngle;
        if(isDefense && aiP.vx > -aiMaxS) aiP.vx -= aiAcc; else if(!isDefense && aiP.vx < aiMaxS) aiP.vx += aiAcc;
        if(dy < 0 && aiP.vy > -aiMaxS) aiP.vy -= aiAcc; if(dy > 0 && aiP.vy < aiMaxS) aiP.vy += aiAcc;
        if((isDefense && aiP.x < 350) || (!isDefense && aiP.x > 650) || Math.random() < (0.01 * aiDifficulty)) shootBall(aiP, aiP.aimAngle, 10 + aiDifficulty);
    } else {
        let tX = b.x, tY = b.y;
        if(aiP.x < tX && aiP.vx < aiMaxS) aiP.vx += aiAcc; if(aiP.x > tX && aiP.vx > -aiMaxS) aiP.vx -= aiAcc; 
        if(aiP.y < tY && aiP.vy < aiMaxS) aiP.vy += aiAcc; if(aiP.y > tY && aiP.vy > -aiMaxS) aiP.vy -= aiAcc;
        aiP.a = Math.atan2(tY - aiP.y, tX - aiP.x);
    }
    if(Math.random() < 0.002) { aiP.emote = ['😡','😱'][Math.floor(Math.random()*2)]; aiP.emoteT = 100; }
}

function handleAI() {
    if(!gameMode.includes('pve') && !gameMode.includes('online')) return;
    if (gameMode === 'pve' || gameMode === 'online') { runAI(p2, true); }
    else if(gameMode === 'online2v2') { runAI(p2, true); runAI(p3, false); runAI(p4, true); } 
}

function triggerGoalAnimation() {
    let gs = document.getElementById('goal-screen'); 
    if(gs) {
        gs.classList.add('show');
        if(matchType === 'golden' || matchType === 'caos') {
            if(goalScorer === 'p1') { gs.innerText = sysLang === 'en' ? "YOU WIN!" : sysLang === 'pt' ? "VOCÊ VENCEU!" : "¡GANASTE!"; gs.style.color = "var(--success)"; } 
            else { gs.innerText = sysLang === 'en' ? "YOU LOSE!" : sysLang === 'pt' ? "VOCÊ PERDEU!" : "¡PERDISTE!"; gs.style.color = "var(--danger)"; }
        } else { gs.innerText = "⚽"; gs.style.color = "white"; }
    }
    setTimeout(()=>{ 
        if(gs) gs.classList.remove('show'); goalParticles=[]; resetPositions(); 
        if(matchType === 'golden' || matchType === 'caos') { handleHalfTime(true); } else { setTimeout(()=>{if(currentTime>0)gameState='playing';},200); }
    }, 2000);
}

function gameLoop() { 
    if(gameState!=='menu') { 
        let sk = FULL_CATALOG.skin[currentUser.equipped.skin];
        if(gameState==='playing') {
            handleInput(); handleAI(); updateChaos();
            let pFric = iceMode ? 0.99 : FRICTION; 
            let players = gameMode.includes('2v2') ? [p1,p2,p3,p4] : [p1,p2];
            players.forEach(p=>{
                p.x+=p.vx; p.y+=p.vy; p.vx*=pFric; p.vy*=pFric; 
                if(chaosActiveEvent === 'mud') { for(let m of mudPuddles) { if(Math.hypot(p.x - m.x, p.y - m.y) < m.r) { p.vx *= 0.8; p.vy *= 0.8; break; } } }
                chkWall(p);
            }); 
            updatePossession(); if(!b.owner) { b.x+=b.vx; b.y+=b.vy; b.vx*=BALL_FRICTION; b.vy*=BALL_FRICTION; } chkWall(b);
            recFrame(); drawPitch(); drawChaos(); b.drawB(); 
            if(sk) p1.drawP(sk.c, sk.s); p2.drawP('#3b82f6', '#d2dae2'); 
            if(gameMode.includes('2v2')){ p3.drawP('#10b981', '#fcd34d'); p4.drawP('#8b5cf6', '#cbd5e1'); }
            drawAimArrow(); drawRadar(); drawEmotes(); drawWeather();
        } else if(gameState==='replay_trans') { 
            drawPitch(); drawChaos(); b.drawB(); if(sk) p1.drawP(sk.c, sk.s); p2.drawP('#3b82f6', '#d2dae2'); 
            if(gameMode.includes('2v2')){ p3.drawP('#10b981', '#fcd34d'); p4.drawP('#8b5cf6', '#cbd5e1'); } drawPart(); drawRadar(); drawEmotes(); drawWeather();
        } else if(gameState==='replay') { 
            if(replayIndex<replayBuffer.length) { drawFrame(replayBuffer[Math.floor(replayIndex)]); drawWeather(); replayIndex+=0.5; } else { let rb = document.getElementById('replay-badge'); if(rb) rb.style.display='none'; gameState='goal'; triggerGoalAnimation(); }
        } else if(gameState==='goal'||gameState==='paused') { 
            drawPitch(); drawChaos(); b.drawB(); if(sk) p1.drawP(sk.c, sk.s); p2.drawP('#3b82f6', '#d2dae2'); 
            if(gameMode.includes('2v2')){ p3.drawP('#10b981', '#fcd34d'); p4.drawP('#8b5cf6', '#cbd5e1'); } drawPart(); drawRadar(); drawEmotes(); drawWeather(); 
        } else if(gameState==='hud_edit') { drawPitch(); b.drawB(); if(sk) p1.drawP(sk.c, sk.s); p2.drawP('#3b82f6', '#d2dae2'); }
    } 
    prevKeys = {...keys}; requestAnimationFrame(gameLoop); 
}

let currTime=90, currentHalf=1, tInt;
function updateTimerUI() { 
    if(matchType === 'golden' || matchType === 'caos') { setTxt('timer', '∞'); setTxt('half-indicator', sysLang==='en'?"GOLDEN GOAL":sysLang==='pt'?"GOL DE OURO":"GOL DE ORO"); } 
    else { let min = Math.floor(currTime/60); let sec = currTime%60; setTxt('timer', `${min<10?'0':''}${min}:${sec<10?'0':''}${sec}`); setTxt('half-indicator', currentHalf===1?(sysLang==='en'?"1st HALF":sysLang==='pt'?"1º TEMPO":"1er TIEMPO"):(sysLang==='en'?"2nd HALF":sysLang==='pt'?"2º TEMPO":"2do TIEMPO")); }
}
function startTimer() { clearInterval(tInt); updateTimerUI(); tInt=setInterval(()=>{ if(gameState==='playing' && matchType !== 'golden' && matchType !== 'caos'){currTime--; updateTimerUI(); if(currTime<=0) handleHalfTime();} }, 1000); }
function togglePause() { if(gameState==='playing'){gameState='paused'; clearInterval(tInt); openScreen('pause-screen');} else if(gameState==='paused'){closeScreen('pause-screen'); gameState='playing'; startTimer();} }
function abandonMatch() { closeScreen('pause-screen'); goHome(); resetPositions(); }
function handleHalfTime(isGoldenEnd = false) { 
    gameState='paused'; clearInterval(tInt); let ms = document.getElementById('match-stats'); 
    let tPos = matchStats.p1Pos + matchStats.p2Pos || 1; let pct1 = Math.round((matchStats.p1Pos/tPos)*100); let pct2 = 100 - pct1;
    let oppName = document.getElementById('name2-display').innerText;
    if(ms) { 
        ms.innerHTML=`<table style="width:100%; color:white; font-size:1rem; margin-top:10px; border-collapse:collapse;"><tr><th style="width:33%; color:var(--danger)">${currentUser.name}</th><th style="width:33%; color:var(--gold)">STATS</th><th style="width:33%; color:var(--primary)">${oppName}</th></tr><tr><td style="text-align:center; font-size:1.3rem;"><b>${score.p1}</b></td><td style="text-align:center; font-size:0.8rem;">GOLES</td><td style="text-align:center; font-size:1.3rem;"><b>${score.p2}</b></td></tr><tr style="background:rgba(255,255,255,0.1);"><td style="text-align:center">${pct1}%</td><td style="text-align:center; font-size:0.8rem;">POSESIÓN</td><td style="text-align:center">${pct2}%</td></tr><tr><td style="text-align:center">${matchStats.p1Sho}</td><td style="text-align:center; font-size:0.8rem;">TIROS</td><td style="text-align:center">${matchStats.p2Sho}</td></tr><tr style="background:rgba(255,255,255,0.1);"><td style="text-align:center">${matchStats.p1Stl}</td><td style="text-align:center; font-size:0.8rem;">ROBOS</td><td style="text-align:center">${matchStats.p2Stl}</td></tr></table>`; 
    } 
    if(currentHalf===1 && !isGoldenEnd){setTxt('match-overlay-title', sysLang==='en'?"End 1st Half":sysLang==='pt'?"Fim 1º Tempo":"Fin 1er Tiempo"); openScreen('match-overlay');} 
    else { 
        let tStr = (matchType === 'golden' || matchType === 'caos') ? (sysLang==='en'?"GOLDEN GOAL":sysLang==='pt'?"GOL DE OURO":"¡GOL DE ORO!") : (sysLang==='en'?"Match Ended":sysLang==='pt'?"Fim de Jogo":"Fin del Partido");
        setTxt('match-overlay-title', tStr); addStat('play',1); addXP(50); 
        if(score.p1>score.p2 || ((matchType==='golden'||matchType==='caos') && goalScorer==='p1')){currentUser.coins+=50; currentUser.stars+=1; if(ms) ms.innerHTML+=`<br><div style="color:var(--gold); font-weight:bold; text-align:center; margin-top:10px;">Victoria! +50 🪙 | +1 ⭐</div>`; addStat('wins',1); addXP(100);} 
        saveAccounts(); openScreen('match-overlay'); 
    } 
}
function continueMatch() { closeScreen('match-overlay'); if(currentHalf===1 && matchType !== 'golden' && matchType !== 'caos'){currentHalf=2;currTime=90;resetPositions();gameState='playing';startTimer();} else {goHome();} }

window.addEventListener('keydown', e=>{ keys[e.key]=true; if((e.key==='Escape'||e.key.toLowerCase()==='p')&&(gameState==='playing'||gameState==='paused'))togglePause(); }); window.addEventListener('keyup', e=>{ keys[e.key]=false; });

loadAccount(activeUserEmail); 
applyTheme(sysTheme); applyLanguage(sysLang); 
setTimeout(checkInitialLogin, 500);
requestAnimationFrame(gameLoop);
