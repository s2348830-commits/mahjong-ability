// public/cardEditor.js
(function(global) {
    'use strict';

    class CardEditor {
        constructor() {
            // UIの初期化
            this.container = document.getElementById('card-editor-container');
            if (!this.container) return;
            
            this.initDOM();
            this.bindEvents();
        }

        initDOM() {
            this.container.innerHTML = `
                <div class="editor-layout" style="display: flex; gap: 20px; padding: 10px; background: #2c3e50; color: white;">
                    <div class="block-library" style="width: 200px; background: #34495e; padding: 10px; min-height: 400px;">
                        <h3>ブロック一覧</h3>
                        <p style="font-size: 12px; color: #aaa;">ドラッグして右へ</p>
                        
                        <div class="block condition-block" draggable="true" data-type="IS_MY_TURN" style="background: #e67e22; padding: 5px; margin-bottom: 5px; cursor: grab;">条件: 自分の手番</div>
                        <div class="block condition-block" draggable="true" data-type="IS_RIICHI" style="background: #e67e22; padding: 5px; margin-bottom: 5px; cursor: grab;">条件: 立直している</div>
                        
                        <div class="block effect-block" draggable="true" data-type="DRAW_CARDS" data-val="2" style="background: #3498db; padding: 5px; margin-bottom: 5px; cursor: grab;">効果: 2枚ツモ</div>
                        <div class="block effect-block" draggable="true" data-type="DISCARD_CARDS" data-val="2" style="background: #3498db; padding: 5px; margin-bottom: 5px; cursor: grab;">効果: 2枚捨てる</div>
                        <div class="block effect-block" draggable="true" data-type="ADD_DORA" style="background: #9b59b6; padding: 5px; margin-bottom: 5px; cursor: grab;">効果: ドラを1枚めくる</div>
                    </div>

                    <div class="workspace" style="flex: 1; background: #ecf0f1; color: #333; padding: 20px; position: relative;">
                        <h3>カード作成エリア</h3>
                        <div>
                            <label>カード名: <input type="text" id="card-name" value="マイスキル"></label>
                        </div>
                        
                        <div style="margin-top: 20px;">
                            <h4>発動条件 (1つのみ)</h4>
                            <div id="slot-condition" class="drop-slot" style="min-height: 50px; border: 2px dashed #e67e22; padding: 10px;">
                                </div>
                        </div>

                        <div style="margin-top: 20px;">
                            <h4>効果 (複数可・上から順に実行)</h4>
                            <div id="slot-effects" class="drop-slot" style="min-height: 100px; border: 2px dashed #3498db; padding: 10px;">
                                </div>
                        </div>

                        <button id="btn-save-card" style="margin-top: 20px; padding: 10px 20px; background: #27ae60; color: white; border: none; cursor: pointer;">JSONを出力して保存</button>
                    </div>
                </div>
            `;
        }

        bindEvents() {
            let draggedElement = null;

            // ライブラリ内のブロックのドラッグ開始イベント
            const blocks = this.container.querySelectorAll('.block');
            blocks.forEach(block => {
                block.addEventListener('dragstart', (e) => {
                    draggedElement = e.target.cloneNode(true);
                    draggedElement.style.margin = '5px 0';
                    e.dataTransfer.setData('text/plain', ''); // Firefox対応
                });
            });

            // ドロップエリアの処理
            const slots = this.container.querySelectorAll('.drop-slot');
            slots.forEach(slot => {
                slot.addEventListener('dragover', (e) => {
                    e.preventDefault(); // ドロップを許可
                    slot.style.backgroundColor = 'rgba(0,0,0,0.1)';
                });

                slot.addEventListener('dragleave', (e) => {
                    slot.style.backgroundColor = 'transparent';
                });

                slot.addEventListener('drop', (e) => {
                    e.preventDefault();
                    slot.style.backgroundColor = 'transparent';

                    if (!draggedElement) return;

                    // 制約チェック
                    if (slot.id === 'slot-condition' && draggedElement.classList.contains('condition-block')) {
                        slot.innerHTML = ''; // 条件は1つのみにするためクリア
                        slot.appendChild(draggedElement);
                    } else if (slot.id === 'slot-effects' && draggedElement.classList.contains('effect-block')) {
                        slot.appendChild(draggedElement);
                    } else {
                        alert('そのスロットには配置できません。');
                    }
                    draggedElement = null;
                });
            });

            // 保存（AST生成）ボタン
            document.getElementById('btn-save-card').addEventListener('click', () => {
                const cardJSON = this.generateAST();
                console.log("Generated AST for CardEngine:", cardJSON);
                alert("コンソールに生成されたJSONを出力しました！\nこれをサーバーに送信します。");
                
                // 実際はここで NetworkManager を通じてサーバーに送信する
                // window.NetworkManager.sendRequest('SAVE_CARD', { card: cardJSON });
            });
        }

        /**
         * ワークスペースのDOMから、サーバーが解釈できるJSON(AST)を構築する
         */
        generateAST() {
            const cardName = document.getElementById('card-name').value;
            
            // 条件の解析
            const conditionSlot = document.getElementById('slot-condition');
            const condBlock = conditionSlot.querySelector('.condition-block');
            let conditionAST = null;
            if (condBlock) {
                conditionAST = { type: condBlock.dataset.type };
            }

            // 効果の解析（複数ある場合はSEQUENCEとしてまとめる）
            const effectSlot = document.getElementById('slot-effects');
            const effectBlocks = effectSlot.querySelectorAll('.effect-block');
            let effectAST = null;
            
            if (effectBlocks.length > 0) {
                const actions = Array.from(effectBlocks).map(block => {
                    return {
                        type: block.dataset.type,
                        amount: block.dataset.val ? parseInt(block.dataset.val) : 1
                    };
                });

                if (actions.length === 1) {
                    effectAST = actions[0];
                } else {
                    effectAST = {
                        type: 'SEQUENCE',
                        actions: actions
                    };
                }
            }

            return {
                name: cardName,
                condition: conditionAST,
                effect: effectAST
            };
        }
    }

    global.CardEditor = CardEditor;

})(typeof window !== 'undefined' ? window : this);