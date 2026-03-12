const network = new Network();
network.connect();

// 部屋を作成するボタンの処理
document.getElementById('btn-create-room').addEventListener('click', () => {
    const roomName = document.getElementById('input-room-name').value.trim() || '名無し部屋';
    const password = document.getElementById('input-room-password').value;

    network.send('CREATE_ROOM', { 
        name: roomName,
        password: password
    });
});