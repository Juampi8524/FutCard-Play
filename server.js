const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Le decimos al servidor que muestre tu HTML que está en la carpeta "public"
app.use(express.static('public'));

// Aquí detectamos cuando un jugador abre el juego
io.on('connection', (socket) => {
    console.log('Un jugador se ha conectado. ID:', socket.id);

    // Cuando el jugador cierra la pestaña
    socket.on('disconnect', () => {
        console.log('El jugador se ha desconectado. ID:', socket.id);
    });
});

// Render nos da un puerto automático, si no, usamos el 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de FutCard corriendo en el puerto ${PORT}`);
});
