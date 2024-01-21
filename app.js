const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.get('/', (req, res) => res.sendFile(__dirname + '/status.html'));

const rooms = {};

io.on('connection', (socket) => {
    let room;

    socket.on('CREATE_ROOM', (data, callback) => {
        if (data.password === '1234de') {
            const roomCode = generateRoomCode();
            socket.join(roomCode);
            rooms[roomCode] = { host: socket.id, code: roomCode, state: 'waiting', players: {}, correctSolution: null, startTime: 0 };

            callback(roomCode);
        } else {
            callback(null);
        }
    });

    socket.on('CHECK_ROOM', (data, callback) => {
        const room = rooms[data.code];
        callback(!!room);
    });

    socket.on('JOIN_ROOM', (data, callback) => {
        room = rooms[data.code];
        if (room && room.state === 'waiting' && !room.players[socket.id]) {
            socket.join(data.code);
            room.players[socket.id] = { name: data.name, character: data.character, points: 0 };
            io.to(room.host).emit('PLAYER_JOINED', { id: socket.id, name: data.name, character: data.character });
            callback(true);
        } else {
            callback(false);
        }
    });

    socket.on('SHOW_QUESTION', (data, callback) => {
        if (room && room.state === 'waiting') {
            room.state = 'ingame';
            room.correctSolution = data.solution;
            io.to(room.code).emit('QUESTION_RECEIVED', { question: data.question });
            room.startTime = Date.now();
            callback(true);
        } else {
            callback(false);
        }
    });

    socket.on('SUBMIT_ANSWER', (data, callback) => {
        if (room && room.state === 'ingame' && room.players[socket.id]) {
            const isCorrect = data.answer === room.correctSolution;
            const points = calculatePoints(isCorrect, room);
            room.players[socket.id].points += points;
            io.to(socket.id).emit('ANSWER_RECEIVED', { isCorrect, points });
            callback({ isCorrect, points });
        } else {
            callback({ isCorrect: false, points: 0 });
        }
    });

    socket.on('SKIP_QUESTION', (data, callback) => {
        if (room && room.state === 'ingame') {
            io.to(room.host).emit('QUESTION_SKIPPED');
            callback(true);
        } else {
            callback(false);
        }
    });

    socket.on('CLOSE_ROOM', () => {
        if (room) {
            io.to(room.code).emit('ROOM_CLOSED');
            delete rooms[room.code];
        }
    });

    socket.on('disconnect', () => {
        if (room && room.players[socket.id]) {
            io.to(room.host).emit('PLAYER_LEFT', { id: socket.id });
            delete room.players[socket.id];
        }
    });
});

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function calculatePoints(isCorrect, room) {
    const basePoints = 100;
    const maxTime = 10000;
    const timeTaken = Math.min(maxTime, Date.now() - room.startTime);
    const timeFactor = Math.max(0, 1 - timeTaken / maxTime);

    return isCorrect ? Math.round(basePoints * timeFactor) : 0;
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});