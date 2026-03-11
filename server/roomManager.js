// server/roomManager.js
const crypto = require('crypto');

class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.playerRoomMap = new Map();
    }

    generateId() {
        return crypto.randomBytes(8).toString('hex');
    }

    createRoom(ws, settings) {
        const roomId = this.generateId();
        const room = {
            id: roomId,
            name: settings.name || "名称未設定の部屋",
            hostId: ws.id,
            maxPlayers: settings.maxPlayers || 4,
            cardSettings: {
                count: settings.cardCount || 5,
                timing: settings.cardTiming || 'game'
            },
            players: [],
            status: 'WAITING'
        };

        this.rooms.set(roomId, room);
        this.joinRoom(ws, roomId);
        
        return room;
    }

    joinRoom(ws, roomId) {
        const room = this.rooms.get(roomId);
        
        if (!room) throw new Error('部屋が見つかりません。');
        if (room.status !== 'WAITING') throw new Error('既にゲームが開始されています。');
        if (room.players.length >= room.maxPlayers) throw new Error('部屋は満員です。');
        if (this.playerRoomMap.has(ws.id)) throw new Error('既に別の部屋に参加しています。');

        const newPlayer = {
            id: ws.id,
            ws: ws,
            name: `Player_${ws.id.substring(0, 4)}`,
            isReady: false,
            equippedCards: [] // 【追加】装備中の能力カードを保存する配列
        };

        room.players.push(newPlayer);
        this.playerRoomMap.set(ws.id, roomId);

        this.broadcastRoomState(roomId);
        return room;
    }

    setReady(ws, isReady) {
        const roomId = this.playerRoomMap.get(ws.id);
        if (!roomId) throw new Error('部屋に参加していません。');

        const room = this.rooms.get(roomId);
        const player = room.players.find(p => p.id === ws.id);
        
        if (player) {
            player.isReady = isReady;
            this.broadcastRoomState(roomId);
        }
    }

    // 【追加】プレイヤーに能力カードを装備させる
    equipCard(wsId, cardData) {
        const roomId = this.playerRoomMap.get(wsId);
        if (!roomId) return; // 部屋にいない場合は無視（今回はロビー全体での永続保存ではなく部屋単位の保存）

        const room = this.rooms.get(roomId);
        const player = room.players.find(p => p.id === wsId);
        
        if (player) {
            // 現在は1枚だけ装備する仕様（追加する場合は push にする）
            player.equippedCards = [cardData];
            this.broadcastRoomState(roomId);
            console.log(`Player ${wsId} equipped card: ${cardData.name}`);
        }
    }

    startGame(ws) {
        const roomId = this.playerRoomMap.get(ws.id);
        if (!roomId) throw new Error('部屋に参加していません。');

        const room = this.rooms.get(roomId);
        
        if (room.hostId !== ws.id) throw new Error('ホストのみがゲームを開始できます。');
        if (room.players.length < 2) throw new Error('プレイヤーが足りません。');
        
        const allReady = room.players.every(p => p.isReady || p.id === room.hostId);
        if (!allReady) throw new Error('全員が準備完了していません。');

        room.status = 'PLAYING';
        this.broadcastRoomState(roomId);
        
        console.log(`Room ${roomId} started the game!`);
        return room;
    }

    leaveRoom(wsId) {
        const roomId = this.playerRoomMap.get(wsId);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        room.players = room.players.filter(p => p.id !== wsId);
        this.playerRoomMap.delete(wsId);

        if (room.players.length === 0) {
            this.rooms.delete(roomId);
            console.log(`Room ${roomId} was destroyed.`);
        } else {
            if (room.hostId === wsId) {
                room.hostId = room.players[0].id;
            }
            this.broadcastRoomState(roomId);
        }
    }

    getLobbyRooms() {
        const openRooms = [];
        this.rooms.forEach(room => {
            if (room.status === 'WAITING') {
                openRooms.push({
                    id: room.id,
                    name: room.name,
                    playersCount: room.players.length,
                    maxPlayers: room.maxPlayers,
                    cardSettings: room.cardSettings
                });
            }
        });
        return openRooms;
    }

    broadcastRoomState(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const safeRoomData = {
            id: room.id,
            name: room.name,
            hostId: room.hostId,
            maxPlayers: room.maxPlayers,
            cardSettings: room.cardSettings,
            status: room.status,
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                isReady: p.isReady,
                hasCard: p.equippedCards.length > 0 // 他人には「カードを装備しているか」だけ教える（チート対策）
            }))
        };

        const eventPayload = JSON.stringify({
            type: 'EVENT_ROOM_STATE_SYNC',
            eventID: `evt_${this.generateId()}`,
            payload: safeRoomData
        });

        room.players.forEach(player => {
            if (player.ws && player.ws.readyState === 1) {
                player.ws.send(eventPayload);
            }
        });
    }

    handleDisconnect(wsId) {
        const roomId = this.playerRoomMap.get(wsId);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (room.status === 'PLAYING') {
            console.log(`Player ${wsId} disconnected during a game. Starting 60s timer.`);
            // TODO: スマホの裏画面移行による一時的な切断への対応として、AI交代までの猶予（60秒）をカウントする
        } else {
            this.leaveRoom(wsId);
        }
    }
}

module.exports = RoomManager;