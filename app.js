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
        for (const roomCode in rooms) {
            if (rooms[roomCode].host === socket.id) {
                return callback(roomCode);
            }
        }

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
            socket.join(data?.code?.toString());
            room.players[socket.id] = { name: data.name, character: data.character, points: 0 };
            io.to(room.host).emit('PLAYER_JOINED', { id: socket.id, name: data.name, character: data.character });
            callback(true);
        } else {
            callback(false);
        }
    });

    socket.on('SHOW_QUESTION', (data, callback) => {
        for (const roomCode in rooms) {
            if (rooms[roomCode].host === socket.id) {
                rooms[roomCode].state = 'ingame';
                rooms[roomCode].correctSolution = data.solution;
                io.to(roomCode.toString()).emit('QUESTION_RECEIVED', { question: data.question });
                rooms[roomCode].startTime = Date.now();
                callback(true);
                return;
            }
        }

        callback(false);
    });

    socket.on('SUBMIT_ANSWER', (data) => {
        if (room && room.state === 'ingame' && room.players[socket.id]) {
            const isCorrect = data.answer === room.correctSolution;
            const points = calculatePoints(isCorrect, room);
            room.players[socket.id].points += points;
        }
    });

    socket.on('SKIP_QUESTION', (data, callback) => {
        for (const roomCode in rooms) {
            if (rooms[roomCode].host === socket.id) {
                if (rooms[roomCode].state === 'ingame') {
                    io.to(roomCode.toString()).emit('ANSWER_RECEIVED', { answer: rooms[roomCode].correctSolution });
                    callback(true);
                } else {
                    callback(false);
                }
            }
        }

    });

    socket.on('CLOSE_ROOM', (data, callback) => {
        for (const roomCode in rooms) {
            if (rooms[roomCode].host === socket.id) {
                callback(rooms[roomCode]?.players);
                io.to(roomCode.toString()).emit('ROOM_CLOSED');

                for (const player of Object.keys(rooms[roomCode].players))
                    io.sockets.sockets.get(player)?.disconnect();

                delete rooms[roomCode];
            }
        }
    });

    socket.on('disconnect', () => {
        for (const roomCode in rooms) {
            if (rooms[roomCode].host === socket.id) {
                for (const player of Object.keys(rooms[roomCode].players)) {
                    io.to(player).emit("ROOM_CLOSED");
                    io.sockets.sockets.get(player)?.disconnect();
                }
                delete rooms[roomCode];
                return;
            }
        }

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

    return isCorrect ? Math.round(basePoints * timeFactor + basePoints) : 0;
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});