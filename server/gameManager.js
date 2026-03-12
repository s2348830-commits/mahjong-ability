class GameManager {
    constructor(roomId, engine, broadcastFn, onStateChange, onNextTurn) {
        this.roomId = roomId;
        this.engine = engine;
        this.broadcast = broadcastFn;       // 部屋の全員に送信する関数
        this.onStateChange = onStateChange; // 状態同期用コールバック (鳴き成立時など)
        this.onNextTurn = onNextTurn;       // 次のターンのツモ用コールバック (誰も鳴かなかった時)

        // アクション待ち受け用の状態管理
        this.actionWindow = {
            active: false,
            timer: null,
            pendingActions: [],
            discardedTile: null,
            discarderId: null
        };

        // アクションの優先順位定義（数字が小さいほど強い）
        // 能力カード > ロン > ポン/カン > チー の要件を満たします
        this.priorityMap = {
            'ABILITY': 1,
            'RON': 2,
            'PON': 3,
            'KAN': 3,
            'CHII': 4,
            'PASS': 99
        };
    }

    // プレイヤーが牌を捨てた時に呼ばれる
    handleDiscard(playerId, tileIndex) {
        // engine側で捨て牌処理を行い、捨てられた牌を取得
        const result = this.engine.discardTile(playerId, tileIndex);
        if (!result) return false;

        const discardedTile = result.tile;
        this.broadcast({
            type: 'TILE_DISCARDED',
            playerId: playerId,
            tile: discardedTile
        });

        // 打牌に対するリアクション（鳴き・ロン・能力）の待ち受けを開始
        this.startActionWindow(playerId, discardedTile);
        return true;
    }

    startActionWindow(discarderId, discardedTile) {
        this.actionWindow = {
            active: true,
            pendingActions: [],
            discardedTile: discardedTile,
            discarderId: discarderId,
            timer: null
        };

        // 5秒間、各プレイヤーからのリアクションを待つ
        const ACTION_TIMEOUT_MS = 5000;
        
        this.actionWindow.timer = setTimeout(() => {
            this.resolveActions();
        }, ACTION_TIMEOUT_MS);
    }

    // クライアントから「ポン」「ロン」「能力発動」「パス」などの要求を受け取る
    registerAction(playerId, actionType, payload = {}) {
        if (!this.actionWindow.active) return;
        if (playerId === this.actionWindow.discarderId) return; // 捨てた本人はリアクション不可

        // 既にアクションを登録済みなら上書き（最後に押したボタンを優先するなど）
        const existingIndex = this.actionWindow.pendingActions.findIndex(a => a.playerId === playerId);
        const actionData = { playerId, actionType, payload, priority: this.priorityMap[actionType] || 99 };

        if (existingIndex >= 0) {
            this.actionWindow.pendingActions[existingIndex] = actionData;
        } else {
            this.actionWindow.pendingActions.push(actionData);
        }

        // 全員（捨てた人以外の3人）が何かしらのアクション（パス含む）を返したら、
        // タイマーを待たずに即時解決する
        if (this.actionWindow.pendingActions.length === 3) {
            clearTimeout(this.actionWindow.timer);
            this.resolveActions();
        }
    }

    // 集まったアクションを評価し、次に起こるべき事象を決定する
    resolveActions() {
        this.actionWindow.active = false;
        const actions = this.actionWindow.pendingActions;

        // パス以外のアクションを抽出し、優先順位（priority）の昇順でソート
        const validActions = actions
            .filter(a => a.actionType !== 'PASS')
            .sort((a, b) => a.priority - b.priority);

        if (validActions.length === 0) {
            // 誰も何も鳴かなかった場合、通常通り次の人の手番へ移行し、ツモ処理を呼ぶ
            this.engine.nextTurn();
            this.onNextTurn(); 
            return;
        }

        // 最も優先度の高いアクションを実行
        const winningAction = validActions[0];

        // ダブロン（2人が同時にロン）の処理など、同順位が複数いる場合の拡張もここで可能
        this.executeWinningAction(winningAction);
    }

    executeWinningAction(action) {
        const { playerId, actionType, payload } = action;

        // アクションが成立したことを全員に通知
        this.broadcast({
            type: 'ACTION_RESOLVED',
            playerId: playerId,
            actionType: actionType,
            tile: this.actionWindow.discardedTile
        });

        switch (actionType) {
            case 'ABILITY':
                // 後で実装する能力カードエンジンに処理を委譲
                // this.cardEngine.execute(payload.cardId, playerId, this.actionWindow.discardedTile);
                break;
            case 'RON':
                this.engine.roundState = 'finished';
                this.broadcast({ type: 'GAME_OVER', winner: playerId, reason: 'RON' });
                break;
            case 'PON':
            case 'CHII':
            case 'KAN':
                // 鳴き処理（payload.consumeTiles には消費する手牌の文字列配列が入る想定）
                this.engine.executeMeld(playerId, actionType, this.actionWindow.discardedTile, payload.consumeTiles || []);
                
                // 鳴いた人の手番になる
                this.engine.setTurn(playerId);
                
                // 盤面が変化したため、全員に最新状態を再同期する
                this.onStateChange();
                
                // ※鳴いた後はツモらずにそのまま打牌を待つ状態になるため、onNextTurn()は呼ばない
                break;
        }
    }
}

module.exports = GameManager;