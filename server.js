const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static('public'));

// --- LÓGICA DEL MULTIJUGADOR ---
io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    // Unirse a una sala específica (usando el código de amigo)
    socket.on('join-room', (roomCode) => {
        socket.join(roomCode);
        console.log(`Socket ${socket.id} se unió a la sala: ${roomCode}`);
    });

    // Enviar movimiento a los demás en la sala
    socket.on('player-move', (data) => {
        // data contiene { x, y, angle, roomCode }
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor FutCard corriendo en puerto ${PORT}`);
});

