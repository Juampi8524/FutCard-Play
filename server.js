Const express = require(‘express’);
Const http = require(‘http’);
Const { Server } = require(‘socket.io’);

Const app = express();
Const server = http.createServer(app);
Const io = new Server(server);

// Le decimos al servidor que muestre tu HTML que está en la carpeta “public”
App.use(express.static(‘public’));

// Aquí detectamos cuando un jugador abre el juego
Io.on(‘connection’, (socket) => {
    Console.log(‘Un jugador se ha conectado. ID:’, socket.id);

    // Cuando el jugador cierra la pestaña
    Socket.on(‘disconnect’, () => {
        Console.log(‘El jugador se ha desconectado. ID:’, socket.id);
    });
});

// Render nos da un puerto automático, si no, usamos el 3000
Const PORT = process.env.PORT || 3000;
Server.listen(PORT, () => {
    Console.log(`Servidor de FutCard corriendo en el puerto ${PORT}`);
});

