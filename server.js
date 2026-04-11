const express = require('express');
const http = require('http');
const path = require('path'); // Añadimos esto para manejar rutas
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// --- SERVIR ARCHIVOS ESTÁTICOS ---
// Usamos 'Public' con P mayúscula para que coincida con tu carpeta real
app.use(express.static(path.join(__dirname, 'Public')));

// Ruta explícita para asegurarnos de que cargue el juego al entrar
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Public', 'index.html'));
});

// --- LÓGICA DEL MULTIJUGADOR (Tu código original) ---
io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    // Unirse a una sala específica (usando el código de amigo)
    socket.on('join-room', (roomCode) => {
        socket.join(roomCode);
        console.log(`Socket ${socket.id} se unió a la sala: ${roomCode}`);
    });

    // Enviar movimiento a los demás en la sala
    socket.on('player-move', (data) => {
        socket.to(data.roomCode).emit('player-moved', {
            id: socket.id,
            x: data.x,
            y: data.y,
            angle: data.angle
        });
    });

    // Sincronizar la pelota
    socket.on('ball-update', (data) => {
        socket.to(data.roomCode).emit('ball-updated', data);
    });

    // Enviar emotes
    socket.on('send-emote', (data) => {
        socket.to(data.roomCode).emit('receive-emote', data);
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
    });
});

// Render usa puertos dinámicos, 10000 es el estándar de Render
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Servidor FutCard corriendo en puerto ${PORT}`);
});

