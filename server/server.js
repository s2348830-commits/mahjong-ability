const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const RoomManager = require('./roomManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// クライアントファイルの配信
app.use(express.static(path.join(__dirname, '../public')));

const roomManager = new RoomManager();

wss.on('connection', (ws, req) => {
    console.log('New client connected');
    ws.id = Math.random().toString(36).substring(2, 9); // 仮のユーザーID
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleClientMessage(ws, data);
        } catch (e) {
            console.error('Invalid message format', e);
        }
    });

    ws.on('close', () => {
        console.log(`Client ${ws.id} disconnected`);
        roomManager.handleDisconnect(ws.id);
    });
});

function handleClientMessage(ws, data) {
    const { type, payload, reqId } = data;
    
    switch (type) {
        case 'GET_ROOM_LIST': // ← 追加！
            ws.send(JSON.stringify({ type: 'ROOM_LIST', rooms: roomManager.getRoomList() }));
            break;
        case 'CREATE_ROOM':
            const roomId = roomManager.createRoom(ws, payload);
            ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomId: roomId, roomName: payload.name }));
            // 部屋が作られたら、他のロビーにいる人にも一覧を更新させるために全体通知しても良い（今回は省略）
            break;
        case 'JOIN_ROOM':
            roomManager.joinRoom(ws, payload.roomId, payload.password); // パスワードを渡す
            break;
        case 'START_GAME':
            roomManager.startGame(payload.roomId);
            break;
        case 'GAME_ACTION':
            roomManager.handleGameAction(ws.id, payload);
            break;
        default:
            console.log('Unknown message type:', type);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

