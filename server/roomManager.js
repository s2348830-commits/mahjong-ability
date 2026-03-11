// server/roomManager.js
const crypto = require('crypto');

class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomId -> Roomオブジェクト
        this.playerRoomMap = new Map(); // playerId -> roomId (切断時の迅速な検索用)
    }

    /**
     * 固有のIDを生成する
     */
    generateId() {
        return crypto.randomBytes(8).toString('hex');
    }

    /**
     * 新しい部屋を作成する
     */
    createRoom(ws, settings) {
        const roomId = this.generateId();
        const room = {
            id: roomId,
            name: settings.name || "名称未設定の部屋",
            hostId: ws.id,
            maxPlayers: settings.maxPlayers || 4,
            cardSettings: {
                count: settings.cardCount || 5,
                timing: settings.cardTiming || 'game' // 'game' (試合毎) or 'round' (局毎)
            },
            players: [],
            status: 'WAITING' // WAITING, PLAYING
        };

        this.rooms.set(roomId, room);
        
        // ホスト自身を部屋に参加させる
        this.joinRoom(ws, roomId);
        
        return room;
    }

    /**
     * 部屋に参加する
     */
    joinRoom(ws, roomId) {
        const room = this.rooms.get(roomId);
        
        if (!room) throw new Error('部屋が見つかりません。');
        if (room.status !== 'WAITING') throw new Error('既にゲームが開始されています。');
        if (room.players.length >= room.maxPlayers) throw new Error('部屋は満員です。');
        if (this.playerRoomMap.has(ws.id)) throw new Error('既に別の部屋に参加しています。');

        const newPlayer = {
            id: ws.id,
            ws: ws,
            name: `Player_${ws.id.substring(0, 4)}`, // 初期名（後でDBと連携して上書き）
            isReady: false
        };

        // ホストは最初から準備完了扱いにする（UIの仕様次第ですが、今回は明示的にボタンを押させます）
        room.players.push(newPlayer);
        this.playerRoomMap.set(ws.id, roomId);

        // 部屋のメンバー全員に最新状態をブロードキャストして同期する
        this.broadcastRoomState(roomId);
        return room;
    }

    /**
     * プレイヤーの準備状態を切り替える
     */
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

    /**
     * ゲームを開始する（ホストのみ実行可能）
     */
    startGame(ws) {
        const roomId = this.playerRoomMap.get(ws.id);
        if (!roomId) throw new Error('部屋に参加していません。');

        const room = this.rooms.get(roomId);
        
        if (room.hostId !== ws.id) throw new Error('ホストのみがゲームを開始できます。');
        if (room.players.length < 2) throw new Error('プレイヤーが足りません。'); // デバッグ時は2人以上等に調整可能
        
        // 全員が準備完了しているか検証（サーバー権威による検証）
        const allReady = room.players.every(p => p.isReady || p.id === room.hostId);
        if (!allReady) throw new Error('全員が準備完了していません。');

        room.status = 'PLAYING';
        this.broadcastRoomState(roomId);
        
        // TODO: ここで gameManager に room データを渡し、麻雀エンジンを初期化する
        console.log(`Room ${roomId} started the game!`);
        return room;
    }

    /**
     * 部屋から退出する / 切断時の処理
     */
    leaveRoom(wsId) {
        const roomId = this.playerRoomMap.get(wsId);
        if (!roomId) return; // 部屋にいなかった場合は無視

        const room = this.rooms.get(roomId);
        room.players = room.players.filter(p => p.id !== wsId);
        this.playerRoomMap.delete(wsId);

        if (room.players.length === 0) {
            // 誰もいなくなったら部屋を削除
            this.rooms.delete(roomId);
            console.log(`Room ${roomId} was destroyed.`);
        } else {
            // ホストが抜けた場合、次の人にホスト権限を移譲する
            if (room.hostId === wsId) {
                room.hostId = room.players[0].id;
            }
            this.broadcastRoomState(roomId);
        }
    }

    /**
     * ロビー画面用に、現在WAITING状態の部屋一覧を取得する
     */
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

    /**
     * 部屋内の全クライアントに最新の部屋状態を同期（Sync）する
     */
    broadcastRoomState(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        // WebSocket送信時に循環参照エラーを防ぐため、必要なデータだけを抽出する
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
                isReady: p.isReady
            }))
        };

        const eventPayload = JSON.stringify({
            type: 'EVENT_ROOM_STATE_SYNC',
            eventID: `evt_${this.generateId()}`,
            payload: safeRoomData
        });

        room.players.forEach(player => {
            if (player.ws && player.ws.readyState === 1 /* WebSocket.OPEN */) {
                player.ws.send(eventPayload);
            }
        });
    }

    /**
     * プレイヤーの不意の切断処理（60秒タイマー・AI交代のトリガー）
     */
    handleDisconnect(wsId) {
        const roomId = this.playerRoomMap.get(wsId);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (room.status === 'PLAYING') {
            // ゲーム中の切断：60秒タイマー起動などの処理（AI交代フェーズ用）
            // TODO: ai.js へのハンドオーバーロジック
            console.log(`Player ${wsId} disconnected during a game. Starting 60s timer.`);
        } else {
            // 待機中の切断：単に部屋から退出させる
            this.leaveRoom(wsId);
        }
    }
}

module.exports = RoomManager;