const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const RoomManager = require('./roomManager');
const GameManager = require('./gameManager'); // 追加: ゲーム進行管理

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 静的ファイル（publicフォルダ）の配信
app.use(express.static('public'));

const roomManager = new RoomManager();
const activeGames = new Map(); // 追加: 進行中のゲームを保存するマップ

wss.on('connection', (ws) => {
    ws.id = generateUniqueId();
    ws.isAlive = true;
    console.log(`Player connected: ${ws.id}`);

    // クライアントからのメッセージ処理
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
        
        // 部屋からの退出・切断処理
        roomManager.handleDisconnect(ws.id);
        
        // もし部屋に誰もいなくなって消滅していたら、ゲームデータも消去する
        if (roomId && !roomManager.rooms.has(roomId)) {
            activeGames.delete(roomId);
        }
    });

    ws.on('pong', () => { ws.isAlive = true; });
});

// クライアントからのリクエストを各モジュールに振り分ける
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
            case 'START_GAME':
                // ホストがゲームを開始した時の処理
                const startedRoom = roomManager.startGame(ws);
                // GameManagerを初期化し、麻雀エンジンを起動する！
                const gm = new GameManager(startedRoom, roomManager);
                activeGames.set(startedRoom.id, gm);
                sendResponse(ws, type, requestID, 'success', {});
                break;
            case 'LEAVE_ROOM':
                roomManager.leaveRoom(ws.id);
                sendResponse(ws, type, requestID, 'success', {});
                break;
            case 'ACTION':
                // ゲーム中のアクション（打牌、鳴きなど）をGameManagerに流す
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
        // エラー時はクライアントに失敗を伝える
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

// 接続維持確認 (Ping/Pong)
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});