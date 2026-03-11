const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const RoomManager = require('./roomManager');
// const Database = require('./database'); // 後続フェーズで実装

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 静的ファイルの配信
app.use(express.static('public'));

const roomManager = new RoomManager();

wss.on('connection', (ws, req) => {
    ws.id = generateUniqueId();
    ws.isAlive = true;
    console.log(`Player connected: ${ws.id}`);

    // クライアントからのメッセージ処理（順序保証のためのキューイング基盤）
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
        roomManager.handleDisconnect(ws.id); // 60秒タイマーとAI交代ロジックのトリガー
    });

    ws.on('pong', () => { ws.isAlive = true; });
});

function handleClientRequest(ws, data) {
    const { type, requestID, payload } = data;
    
    // TODO: リクエストをプレイヤー固有のアクションキューに入れ、順次処理する（レースコンディション対策）
    switch (type) {
        case 'JOIN_LOBBY':
            // 処理
            sendResponse(ws, type, requestID, 'success', { message: 'Joined lobby' });
            break;
        case 'PLAY_CARD':
            // カードエンジンへのフック
            break;
        default:
            console.log(`Unknown action: ${type}`);
    }
}

function sendResponse(ws, type, requestID, status, payload) {
    ws.send(JSON.stringify({ type: `${type}_ACK`, requestID, status, payload }));
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