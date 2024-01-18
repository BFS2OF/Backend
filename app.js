const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {cors: {origin: "*"}});

const rooms = {};

io.on('connection', (socket) => {
    socket.on('CREATE_ROOM', (data, callback) => {
        const roomCode = generateRoomCode();
        socket.join(roomCode);
        rooms[roomCode] = { host: socket.id, code: roomCode };

        callback(roomCode);
    });

    socket.on('CHECK_ROOM', (data, callback) => {
        const room = rooms[data.code];
        if (room && room.host !== socket.id) {
            callback(true);
        } else {
            callback(false);
        }

    });

    socket.on('JOIN_ROOM', (data, callback) => {
        const room = rooms[data.code];
        if (room && room.host !== socket.id) {
            socket.join(data.code);
            io.to(room.host).emit('PLAYER_JOINED', socket.id);
            callback(true);
        } else {
            callback(false);
        }
    });

    socket.on('SHOW_QUESTION', (data, callback) => {
        io.to(room.host).emit('QUESTION_RECEIVED', data.question);
    });

    socket.on('CLOSE_ROOM', () => {
        const room = Object.values(rooms).find((r) => r.host === socket.id);
        if (room) {
            io.to(room.code).emit('hostDisconnected');
            delete rooms[room.code];
        };

    });
});


function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
