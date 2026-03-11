// public/lobby.js
(function(global) {
    'use strict';

    class LobbyManager {
        constructor(network) {
            this.network = network; // public/network.js のインスタンス
            this.currentRoom = null;
            this.myId = null; // ログイン時にサーバーから割り当てられる想定

            this.bindEvents();
        }

        bindEvents() {
            // DOM要素の取得 (index.html にこれらのIDが存在する前提)
            this.btnRefreshLobby = document.getElementById('btn-refresh-lobby');
            this.btnCreateRoom = document.getElementById('btn-create-room');
            this.btnReady = document.getElementById('btn-ready');
            this.btnStartGame = document.getElementById('btn-start-game');
            this.btnLeaveRoom = document.getElementById('btn-leave-room');

            if(this.btnRefreshLobby) this.btnRefreshLobby.addEventListener('click', () => this.fetchRooms());
            if(this.btnCreateRoom) this.btnCreateRoom.addEventListener('click', () => this.createRoom());
            if(this.btnReady) this.btnReady.addEventListener('click', () => this.toggleReady());
            if(this.btnStartGame) this.btnStartGame.addEventListener('click', () => this.startGame());
            if(this.btnLeaveRoom) this.btnLeaveRoom.addEventListener('click', () => this.leaveRoom());

            // サーバーからの同期イベントをリッスンする
            // network.js 側に addEventListener のような仕組みがあるか、もしくはコールバックを登録する前提
            this.network.onEvent('EVENT_ROOM_STATE_SYNC', (payload) => {
                this.updateRoomUI(payload);
            });
        }

        /**
         * ロビーの部屋一覧を取得する
         */
        async fetchRooms() {
            try {
                const response = await this.network.sendRequest('FETCH_ROOMS', {});
                this.renderRoomList(response.rooms);
            } catch (error) {
                console.error('部屋一覧の取得に失敗しました:', error);
                alert('部屋一覧を取得できませんでした。');
            }
        }

        /**
         * 部屋を作成する
         */
        async createRoom() {
            // 本来はUIから値を取得しますが、ここでは固定値の例
            const settings = {
                name: "能力麻雀 練習部屋",
                maxPlayers: 4,
                cardCount: 5,
                cardTiming: "game"
            };

            try {
                const response = await this.network.sendRequest('CREATE_ROOM', settings);
                // 成功すると自動的にEVENT_ROOM_STATE_SYNCが降ってくるのでUIの描画はそちらに任せる
                this.myId = response.myId; 
                this.switchView('room-view');
            } catch (error) {
                alert('部屋の作成に失敗しました: ' + error.message);
            }
        }

        /**
         * 既存の部屋に参加する
         */
        async joinRoom(roomId) {
            try {
                const response = await this.network.sendRequest('JOIN_ROOM', { roomId });
                this.myId = response.myId;
                this.switchView('room-view');
            } catch (error) {
                alert('入室に失敗しました: ' + error.message);
            }
        }

        /**
         * 準備完了/取消 を切り替える
         */
        async toggleReady() {
            if (!this.currentRoom) return;
            
            const me = this.currentRoom.players.find(p => p.id === this.myId);
            const newReadyState = !(me && me.isReady); // 現在の状態を反転

            try {
                await this.network.sendRequest('SET_READY', { isReady: newReadyState });
            } catch (error) {
                console.error('準備状態の変更に失敗しました:', error);
            }
        }

        /**
         * ゲームを開始する (ホストのみ)
         */
        async startGame() {
            try {
                await this.network.sendRequest('START_GAME', {});
            } catch (error) {
                alert('開始できません: ' + error.message);
            }
        }

        /**
         * 部屋から退出する
         */
        async leaveRoom() {
            try {
                await this.network.sendRequest('LEAVE_ROOM', {});
                this.currentRoom = null;
                this.switchView('lobby-view');
                this.fetchRooms();
            } catch (error) {
                console.error('退出処理エラー:', error);
            }
        }

        /**
         * サーバーから受信した最新の部屋状態をUIに反映させる (状態の完全同期)
         */
        updateRoomUI(roomData) {
            this.currentRoom = roomData;

            // ゲーム開始フラグを受信した場合
            if (roomData.status === 'PLAYING') {
                this.switchView('game-view');
                // TODO: mahjongRenderer.js 等に制御を移す
                return;
            }

            const isHost = (roomData.hostId === this.myId);
            const me = roomData.players.find(p => p.id === this.myId);

            // 部屋情報テキストの更新
            const roomTitleEl = document.getElementById('room-title');
            if(roomTitleEl) roomTitleEl.innerText = `${roomData.name} (${roomData.players.length}/${roomData.maxPlayers})`;

            // プレイヤー一覧の描画
            const playerListEl = document.getElementById('room-player-list');
            if (playerListEl) {
                playerListEl.innerHTML = ''; // クリア
                roomData.players.forEach(player => {
                    const li = document.createElement('li');
                    const status = player.id === roomData.hostId ? '[HOST]' : (player.isReady ? '[READY]' : '[WAITING]');
                    li.innerText = `${player.name} ${status}`;
                    // 自分自身は文字色を変えるなどのUI表現
                    if (player.id === this.myId) li.style.fontWeight = 'bold';
                    playerListEl.appendChild(li);
                });
            }

            // ボタンの表示制御
            if (this.btnReady) {
                this.btnReady.style.display = isHost ? 'none' : 'block';
                this.btnReady.innerText = (me && me.isReady) ? '準備取消' : '準備完了';
            }

            if (this.btnStartGame) {
                this.btnStartGame.style.display = isHost ? 'block' : 'none';
                // ホスト以外が全員準備完了かチェック
                const othersReady = roomData.players.every(p => p.id === roomData.hostId || p.isReady);
                const isFull = (roomData.players.length === roomData.maxPlayers);
                
                // 開始条件: 2人以上(テスト用)かつ、他プレイヤーが全員Ready状態
                this.btnStartGame.disabled = !(roomData.players.length >= 2 && othersReady);
            }
        }

        /**
         * ロビーの部屋一覧を描画する
         */
        renderRoomList(rooms) {
            const listEl = document.getElementById('lobby-room-list');
            if (!listEl) return;

            listEl.innerHTML = '';
            if (rooms.length === 0) {
                listEl.innerHTML = '<li>現在参加できる部屋はありません。</li>';
                return;
            }

            rooms.forEach(room => {
                const li = document.createElement('li');
                li.innerText = `${room.name} (${room.playersCount}/${room.maxPlayers}人)`;
                
                const joinBtn = document.createElement('button');
                joinBtn.innerText = '参加';
                joinBtn.onclick = () => this.joinRoom(room.id);
                
                if (room.playersCount >= room.maxPlayers) {
                    joinBtn.disabled = true;
                    joinBtn.innerText = '満員';
                }

                li.appendChild(joinBtn);
                listEl.appendChild(li);
            });
        }

        /**
         * 画面遷移(表示/非表示)を簡易的に行う
         */
        switchView(viewId) {
            ['lobby-view', 'room-view', 'game-view'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = (id === viewId) ? 'block' : 'none';
            });
        }
    }

    // グローバルに公開（初期化用）
    global.LobbyManager = LobbyManager;

})(typeof window !== 'undefined' ? window : this);