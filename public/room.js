let currentRoomId = null;
let isHost = false;

// サーバーからのメッセージを受信
document.addEventListener('serverMessage', (e) => {
    const data = e.detail;

    if (data.type === 'ROOM_LIST') {
        renderRoomList(data.rooms);
    } else if (data.type === 'ROOM_CREATED') {
        currentRoomId = data.roomId;
        isHost = true;
        showRoomScreen(data.roomId, data.roomName);
        document.getElementById('btn-start-game').style.display = 'inline-block';
        updatePlayerList(1);
    } else if (data.type === 'PLAYER_JOINED') {
        if (!currentRoomId) {
            currentRoomId = data.roomId;
            showRoomScreen(data.roomId, data.roomName);
        }
        updatePlayerList(data.count);
    } else if (data.type === 'GAME_STARTED') {
        document.getElementById('room-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';
    } else if (data.type === 'ERROR') {
        alert('エラー: ' + data.message); // パスワード間違いなどを表示
    }
});

// 部屋一覧の描画
function renderRoomList(rooms) {
    const list = document.getElementById('room-list');
    list.innerHTML = '';
    
    if (rooms.length === 0) {
        list.innerHTML = '<li>現在待機中の部屋はありません</li>';
        return;
    }

    rooms.forEach(room => {
        const li = document.createElement('li');
        li.style.margin = '10px 0';
        li.style.padding = '10px';
        li.style.background = 'rgba(255,255,255,0.1)';
        
        const lockIcon = room.hasPassword ? '🔒' : '🔓';
        li.innerHTML = `
            ${lockIcon} <strong>${room.name}</strong> 
            (${room.playerCount}/4人) 
            <button onclick="joinSelectedRoom('${room.id}', ${room.hasPassword})">参加</button>
        `;
        list.appendChild(li);
    });
}

// 部屋一覧の「参加」ボタンを押したときの処理（グローバル関数化）
window.joinSelectedRoom = function(roomId, hasPassword) {
    let password = '';
    if (hasPassword) {
        password = prompt('この部屋はパスワードが必要です。\nパスワードを入力してください:');
        if (password === null) return; // キャンセルした場合は何もしない
    }
    network.send('JOIN_ROOM', { roomId: roomId, password: password });
};

// 更新ボタン
document.getElementById('btn-refresh-rooms').addEventListener('click', () => {
    network.send('GET_ROOM_LIST', {});
});

// 画面切り替え
function showRoomScreen(roomId, roomName) {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('room-screen').style.display = 'block';
    document.getElementById('display-room-id').textContent = roomId;
    if(roomName) document.getElementById('display-room-name').textContent = roomName;
}

function updatePlayerList(count) {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const li = document.createElement('li');
        li.textContent = `プレイヤー ${i + 1} ${i === 0 ? '(ホスト)' : ''}`;
        list.appendChild(li);
    }
}

document.getElementById('btn-start-game').addEventListener('click', () => {
    if (isHost && currentRoomId) {
        network.send('START_GAME', { roomId: currentRoomId });
    }
});