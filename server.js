const WebSocket = require('ws');

const port = process.env.PORT || 9080;
const wss = new WebSocket.Server({ port });

console.log(`Signaling server running on port ${port}`);

const rooms = {};

wss.on('connection', (ws) => {
    let currentRoom = null;
    let currentId = null;

    ws.on('message', (messageAsString) => {
        let msg;
        try {
            msg = JSON.parse(messageAsString);
        } catch (e) {
            return;
        }

        if (msg.type === 'join') {
            const roomId = msg.room;
            if (!rooms[roomId]) {
                rooms[roomId] = { host: null, guest: null };
                console.log(`[Sala ${roomId}] Creada por un nuevo host.`);
            }

            if (!rooms[roomId].host) {
                // Join as host (ID 1)
                rooms[roomId].host = ws;
                currentRoom = roomId;
                currentId = 1;
                ws.send(JSON.stringify({ type: 'joined', id: 1, is_host: true }));
            } else if (!rooms[roomId].guest) {
                // Join as guest (ID 2)
                rooms[roomId].guest = ws;
                currentRoom = roomId;
                currentId = 2;
                console.log(`[Sala ${roomId}] Un jugador invitado se ha unido.`);
                ws.send(JSON.stringify({ type: 'joined', id: 2, is_host: false }));
                
                // Notify host that guest connected
                rooms[roomId].host.send(JSON.stringify({ type: 'peer_connected', id: 2 }));
            } else {
                // Room full
                ws.send(JSON.stringify({ type: 'error', message: 'Room full' }));
            }
        }
        else if (msg.type === 'list_rooms') {
            const availableRooms = [];
            for (const r in rooms) {
                if (rooms[r].host && !rooms[r].guest) {
                    availableRooms.push(r);
                }
            }
            ws.send(JSON.stringify({ type: 'room_list', rooms: availableRooms }));
        }
        else if (msg.type === 'message') {
            // Forward message to the other peer in the room
            if (currentRoom && rooms[currentRoom]) {
                const targetId = msg.to;
                const targetWs = targetId === 1 ? rooms[currentRoom].host : rooms[currentRoom].guest;
                
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(JSON.stringify({
                        type: 'message',
                        from: currentId,
                        data: msg.data
                    }));
                }
            }
        }
    });

    ws.on('close', () => {
        if (currentRoom && rooms[currentRoom]) {
            console.log(`[Sala ${currentRoom}] El jugador ${currentId} se ha desconectado. Cerrando sala.`);
            // If one leaves, notify the other and delete room
            const otherWs = currentId === 1 ? rooms[currentRoom].guest : rooms[currentRoom].host;
            if (otherWs && otherWs.readyState === WebSocket.OPEN) {
                otherWs.send(JSON.stringify({ type: 'peer_disconnected', id: currentId }));
            }
            delete rooms[currentRoom];
        }
    });
});
