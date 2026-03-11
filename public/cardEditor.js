// public/cardEditor.js
(function(global) {
    'use strict';

    class CardEditor {
        constructor() {
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
                        <p style="font-size: 12px; color: #f1c40f; font-weight: bold;">👆 タップして追加</p>
                        
                        <div class="block condition-block" draggable="true" data-type="IS_MY_TURN" style="background: #e67e22; padding: 5px; margin-bottom: 5px; cursor: pointer;">条件: 自分の手番</div>
                        <div class="block condition-block" draggable="true" data-type="IS_RIICHI" style="background: #e67e22; padding: 5px; margin-bottom: 5px; cursor: pointer;">条件: 立直している</div>
                        
                        <div class="block effect-block" draggable="true" data-type="DRAW_CARDS" data-val="2" style="background: #3498db; padding: 5px; margin-bottom: 5px; cursor: pointer;">効果: 2枚ツモ</div>
                        <div class="block effect-block" draggable="true" data-type="DISCARD_CARDS" data-val="2" style="background: #3498db; padding: 5px; margin-bottom: 5px; cursor: pointer;">効果: 2枚捨てる</div>
                        <div class="block effect-block" draggable="true" data-type="ADD_DORA" style="background: #9b59b6; padding: 5px; margin-bottom: 5px; cursor: pointer;">効果: ドラを1枚めくる</div>
                    </div>

                    <div class="workspace" style="flex: 1; background: #ecf0f1; color: #333; padding: 20px; position: relative;">
                        <h3>カード作成エリア</h3>
                        <div>
                            <label>カード名: <input type="text" id="card-name" value="マイスキル" style="padding: 5px; width: 150px;"></label>
                        </div>
                        
                        <div style="margin-top: 20px;">
                            <h4>発動条件 (1つのみ) <span style="font-size:12px; color:#e74c3c;">※タップで削除</span></h4>
                            <div id="slot-condition" class="drop-slot" style="min-height: 50px; border: 2px dashed #e67e22; padding: 10px;">
                            </div>
                        </div>

                        <div style="margin-top: 20px;">
                            <h4>効果 (複数可・上から順に実行) <span style="font-size:12px; color:#e74c3c;">※タップで削除</span></h4>
                            <div id="slot-effects" class="drop-slot" style="min-height: 100px; border: 2px dashed #3498db; padding: 10px;">
                            </div>
                        </div>

                        <button id="btn-save-card" style="margin-top: 20px; padding: 10px 20px; background: #27ae60; color: white; border: none; cursor: pointer; width: 100%;">保存して装備する</button>
                    </div>
                </div>
            `;
        }

        bindEvents() {
            let draggedElement = null;
            const blocks = this.container.querySelectorAll('.block');

            blocks.forEach(block => {
                // 【PC向け】従来のドラッグ開始処理
                block.addEventListener('dragstart', (e) => {
                    draggedElement = e.target.cloneNode(true);
                    draggedElement.style.margin = '5px 0';
                    this.setupRemoveOnClick(draggedElement); // ドロップ後もタップで消せるようにする
                    e.dataTransfer.setData('text/plain', '');
                });

                // 【スマホ向け最強解決策】タップするだけで自動でスロットに追加される処理
                block.addEventListener('click', (e) => {
                    const clone = e.target.cloneNode(true);
                    clone.style.margin = '5px 0';
                    this.setupRemoveOnClick(clone); // タップで消せるようにする

                    // 条件ブロックなら条件スロットへ、効果ブロックなら効果スロットへ自動振り分け
                    if (clone.classList.contains('condition-block')) {
                        const slot = document.getElementById('slot-condition');
                        slot.innerHTML = ''; // 条件は1つのみにするため中身をクリア
                        slot.appendChild(clone);
                    } else if (clone.classList.contains('effect-block')) {
                        const slot = document.getElementById('slot-effects');
                        slot.appendChild(clone);
                    }
                });
            });

            // ドロップエリアの処理（PCでのドラッグ＆ドロップ用）
            const slots = this.container.querySelectorAll('.drop-slot');
            slots.forEach(slot => {
                slot.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    slot.style.backgroundColor = 'rgba(0,0,0,0.1)';
                });

                slot.addEventListener('dragleave', (e) => {
                    slot.style.backgroundColor = 'transparent';
                });

                slot.addEventListener('drop', (e) => {
                    e.preventDefault();
                    slot.style.backgroundColor = 'transparent';

                    if (!draggedElement) return;

                    if (slot.id === 'slot-condition' && draggedElement.classList.contains('condition-block')) {
                        slot.innerHTML = ''; 
                        slot.appendChild(draggedElement);
                    } else if (slot.id === 'slot-effects' && draggedElement.classList.contains('effect-block')) {
                        slot.appendChild(draggedElement);
                    } else {
                        alert('そのスロットには配置できません。');
                    }
                    draggedElement = null;
                });
            });

            // 保存ボタン
            document.getElementById('btn-save-card').addEventListener('click', () => {
                const cardJSON = this.generateAST();
                console.log("Generated AST for CardEngine:", cardJSON);
                
                const event = new CustomEvent('saveCardRequest', { detail: cardJSON });
                window.dispatchEvent(event);
                
                alert(`カード「${cardJSON.name}」を保存・装備しました！\n（右上の「閉じる」ボタンでロビーに戻れます）`);
            });
        }

        // ワークスペースに入ったブロックをタップで削除できるようにする補助関数
        setupRemoveOnClick(element) {
            element.style.cursor = 'pointer';
            element.addEventListener('click', function(e) {
                e.stopPropagation(); // 親要素へのクリック伝播を防ぐ
                this.remove(); // 自分自身を消去
            });
        }

        generateAST() {
            const cardName = document.getElementById('card-name').value;
            
            const conditionSlot = document.getElementById('slot-condition');
            const condBlock = conditionSlot.querySelector('.condition-block');
            let conditionAST = null;
            if (condBlock) {
                conditionAST = { type: condBlock.dataset.type };
            }

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