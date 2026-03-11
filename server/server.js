// server/server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const RoomManager = require('./roomManager');
const GameManager = require('./gameManager'); 

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static('public'));

const roomManager = new RoomManager();
const activeGames = new Map(); 

wss.on('connection', (ws) => {
    ws.id = generateUniqueId();
    ws.isAlive = true;
    console.log(`Player connected: ${ws.id}`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleClientRequest(ws, data);
        } catch (e) {
            console.error('Invalid message format', e);
        }
    });

    ws.on('close', () => {
        console.log(`Player disconnected: ${ws.id}`);
        const roomId = roomManager.playerRoomMap.get(ws.id);
        
        // スマホは画面がスリープしただけで頻繁に切断されるため、
        // 部屋からは即座に退出させず、猶予を持たせる処理をroomManagerに委譲します
        roomManager.handleDisconnect(ws.id);
        
        if (roomId && !roomManager.rooms.has(roomId)) {
            activeGames.delete(roomId);
        }
    });

    ws.on('pong', () => { ws.isAlive = true; });
});

function handleClientRequest(ws, data) {
    const { type, requestID, payload } = data;
    
    try {
        switch (type) {
            case 'LOGIN':
                sendResponse(ws, type, requestID, 'success', { myId: ws.id });
                break;
            case 'FETCH_ROOMS':
                sendResponse(ws, type, requestID, 'success', { rooms: roomManager.getLobbyRooms() });
                break;
            case 'CREATE_ROOM':
                const room = roomManager.createRoom(ws, payload);
                sendResponse(ws, type, requestID, 'success', { myId: ws.id, roomId: room.id });
                break;
            case 'JOIN_ROOM':
                const joinedRoom = roomManager.joinRoom(ws, payload.roomId);
                sendResponse(ws, type, requestID, 'success', { myId: ws.id, roomId: joinedRoom.id });
                break;
            case 'SET_READY':
                roomManager.setReady(ws, payload.isReady);
                sendResponse(ws, type, requestID, 'success', {});
                break;
            // ==========================================
            // 【追加】能力カードをサーバーに保存・装備する
            // ==========================================
            case 'EQUIP_CARD':
                roomManager.equipCard(ws.id, payload.card);
                sendResponse(ws, type, requestID, 'success', {});
                break;
            case 'START_GAME':
                const startedRoom = roomManager.startGame(ws);
                const gm = new GameManager(startedRoom, roomManager);
                activeGames.set(startedRoom.id, gm);
                sendResponse(ws, type, requestID, 'success', {});
                break;
            case 'LEAVE_ROOM':
                roomManager.leaveRoom(ws.id);
                sendResponse(ws, type, requestID, 'success', {});
                break;
            case 'ACTION':
                const roomId = roomManager.playerRoomMap.get(ws.id);
                if (roomId && activeGames.has(roomId)) {
                    activeGames.get(roomId).handleAction(ws.id, payload.actionType, payload.payload);
                }
                sendResponse(ws, type, requestID, 'success', {});
                break;
            default:
                console.log(`Unknown action: ${type}`);
                sendResponse(ws, type, requestID, 'error', { message: 'Unknown action' });
        }
    } catch (error) {
        console.error(`Error handling ${type}:`, error.message);
        sendResponse(ws, type, requestID, 'error', { message: error.message });
    }
}

function sendResponse(ws, type, requestID, status, payload) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: `${type}_ACK`, requestID, status, payload }));
    }
}

function generateUniqueId() {
    return Math.random().toString(36).substr(2, 9);
}

// スマホ対応：Ping間隔を少し短くし（20秒）、スリープからの復帰を早く検知する
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 20000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});