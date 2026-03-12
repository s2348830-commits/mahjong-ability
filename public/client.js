const network = new Network();
network.connect();

document.getElementById('btn-create-room').addEventListener('click', () => {
    network.send('CREATE_ROOM', { rules: 'normal' }, (response) => {
        if (response.type === 'ROOM_CREATED') {
            console.log('Room created with ID:', response.roomId);
            document.getElementById('lobby-screen').style.display = 'none';
            document.getElementById('game-screen').style.display = 'block';
        }
    });
});

// サーバーからの非同期イベント処理
document.addEventListener('serverMessage', (e) => {
    const data = e.detail;
    if (data.type === 'GAME_STARTED') {
        console.log('Game has started! State:', data.state);
        // mahjongRenderer.js に状態を渡して描画させる
    }
});