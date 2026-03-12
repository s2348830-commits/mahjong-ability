const renderer = new MahjongRenderer();
let isMyTurn = false;
let myPlayerId = null; // 自分のIDを保持

// サーバーからのメッセージを受信して処理
document.addEventListener('serverMessage', (e) => {
    const data = e.detail;

    switch (data.type) {
        case 'SYNC_STATE':
            // サーバーから最新の状態が送られてきたら全体を描画し直す（ズレ防止）
            isMyTurn = data.state.myTurn;
            renderer.renderState(data.state);
            updateTurnUI();
            break;

        case 'TILE_DRAWN':
            // 自分がツモった時の処理（手牌の末尾に牌を追加して再描画など）
            console.log('ツモりました:', data.tile);
            // ※SYNC_STATEで描画されるため、ここではアニメーション用のフラグ立て等を行う
            break;

        case 'TURN_CHANGED':
            console.log('現在のターン:', data.currentTurn);
            break;

        case 'TILE_DISCARDED':
            // 誰かが牌を捨てた！
            console.log('捨て牌:', data.tile, 'by', data.playerId);
            // もし自分が捨てた牌でなければ、鳴きアクションのパネルを表示する
            if (data.playerId !== network.ws.id) { // ※簡易的なID比較
                showActionPanel(data.tile);
            }
            break;

        case 'ACTION_RESOLVED':
            // 誰かの鳴きやロンが成立した
            console.log('アクション成立:', data.actionType, 'by', data.playerId);
            hideActionPanel();
            break;

        case 'GAME_OVER':
            alert(`ゲーム終了！ 理由: ${data.reason}`);
            break;
    }
});

// 手牌のクリックイベント（打牌）
document.getElementById('my-hand').addEventListener('click', (e) => {
    if (!isMyTurn) return; // 自分の番でなければ無視

    const tileEl = e.target.closest('.tile');
    if (!tileEl) return;

    const tileIndex = parseInt(tileEl.dataset.index, 10);
    
    // サーバーに「この牌を捨てる」と送信
    network.send('GAME_ACTION', {
        action: 'DISCARD',
        tileIndex: tileIndex
    });

    isMyTurn = false;
    updateTurnUI();
});

// --- リアクションパネルの制御 ---

const actionPanel = document.getElementById('action-panel');

function showActionPanel(discardedTile) {
    actionPanel.style.display = 'block';
    // ※本来はここで自分の手牌を解析し、ポンやロンが「可能かどうか」を判定して
    // 押せないボタンをグレーアウトする処理が入ります。
}

function hideActionPanel() {
    actionPanel.style.display = 'none';
}

// パネルのボタンクリックイベント
document.getElementById('btn-pon').addEventListener('click', () => sendReaction('PON'));
document.getElementById('btn-ron').addEventListener('click', () => sendReaction('RON'));
document.getElementById('btn-pass').addEventListener('click', () => sendReaction('PASS'));

function sendReaction(actionType) {
    hideActionPanel();
    
    // サーバーにリアクション（ポン・ロン・パス）を送信
    network.send('GAME_ACTION', {
        action: 'REACTION',
        actionType: actionType,
        payload: {
            // ポンの場合、消費する自分の手牌を指定する必要がある（今回はダミーデータ）
            consumeTiles: actionType === 'PON' ? ['m1', 'm1'] : []
        }
    });
}

function updateTurnUI() {
    const handArea = document.getElementById('my-hand');
    if (isMyTurn) {
        handArea.style.opacity = '1.0';
        handArea.style.borderTop = '3px solid yellow'; // 手番がわかりやすいように
    } else {
        handArea.style.opacity = '0.7';
        handArea.style.borderTop = 'none';
    }
}