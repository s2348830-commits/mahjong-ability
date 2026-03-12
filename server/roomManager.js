const MahjongEngine = require('./mahjongEngine');
const GameManager = require('./gameManager');

class RoomManager {
    constructor() {
        this.rooms = new Map();
    }

    createRoom(hostWs, settings) {
        const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
        this.rooms.set(roomId, {
            id: roomId,
            players: [hostWs],
            settings: settings,
            engine: new MahjongEngine(),
            gameManager: null,
            status: 'waiting'
        });
        return roomId;
    }

    joinRoom(ws, roomId) {
        const room = this.rooms.get(roomId);
        if (room && room.status === 'waiting' && room.players.length < 4) {
            room.players.push(ws);
            this.broadcast(roomId, { type: 'PLAYER_JOINED', count: room.players.length });
            
            // 4人揃ったら自動でゲーム開始（テスト用に減らしてもOK）
            if (room.players.length === 4) {
                this.startGame(roomId);
            }
        }
    }

    startGame(roomId) {
        const room = this.rooms.get(roomId);
        room.status = 'playing';
        const playerIds = room.players.map(p => p.id);
        
        room.engine.initializeGame(playerIds);
        
        // GameManagerの初期化（アクション解決後のコールバックを渡す）
        room.gameManager = new GameManager(roomId, room.engine, 
            (msg) => this.broadcast(roomId, msg),
            () => this.syncAllPlayersState(room), // 状態が変わったら全員に最新状態を同期
            () => this.executeDraw(room)          // 次のターンへ進む際のツモ処理
        );

        // 初期状態を各プレイヤーに送信
        this.syncAllPlayersState(room);

        // 起家（最初のプレイヤー）のツモ処理を実行
        this.executeDraw(room);
    }

    // 最新の盤面・手牌状態を各プレイヤーに同期する（ズレ防止の要）
    syncAllPlayersState(room) {
        room.players.forEach(ws => {
            ws.send(JSON.stringify({
                type: 'SYNC_STATE',
                state: room.engine.getPlayerState(ws.id)
            }));
        });
    }

    // ツモ処理
    async executeDraw(room) {
        const currentPlayerId = room.engine.getCurrentPlayer();
        const result = await room.engine.drawTile(currentPlayerId);

        if (result && result.type === 'draw') {
            // ツモった牌は本人のみに送信
            const ws = room.players.find(p => p.id === currentPlayerId);
            if (ws) ws.send(JSON.stringify({ type: 'TILE_DRAWN', tile: result.tile }));
            
            this.broadcast(room.id, { type: 'TURN_CHANGED', currentTurn: currentPlayerId });
            this.syncAllPlayersState(room); // 残り牌などの情報更新のため同期
        } else if (result && result.type === 'ryukyoku') {
            this.broadcast(room.id, { type: 'GAME_OVER', reason: 'RYUKYOKU' });
        }
    }

    // クライアントからのアクション（打牌、鳴きなど）のルーティング
    handleGameAction(playerId, payload) {
        // プレイヤーが所属している部屋を探す
        let targetRoom = null;
        for (const room of this.rooms.values()) {
            if (room.players.some(p => p.id === playerId)) {
                targetRoom = room;
                break;
            }
        }
        if (!targetRoom || targetRoom.status !== 'playing') return;

        const gm = targetRoom.gameManager;

        if (payload.action === 'DISCARD') {
            // 打牌処理
            gm.handleDiscard(playerId, payload.tileIndex);
        } else if (payload.action === 'REACTION') {
            // ポン・チー・ロン・パスの処理
            gm.registerAction(playerId, payload.actionType, payload.payload);
        }
    }

    broadcast(roomId, message) {
        const room = this.rooms.get(roomId);
        if (room) {
            const data = JSON.stringify(message);
            room.players.forEach(ws => {
                if (ws.readyState === 1) ws.send(data);
            });
        }
    }
}

module.exports = RoomManager;