        const SUPABASE_URL = 'https://jbibiisduuyembkrsrms.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpiaWJpaXNkdXV5ZW1ia3Jzcm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NzQ1ODUsImV4cCI6MjEwMTE1MDU4NX0.aOCowyQS5MDCtzZQrwkPjxim8kHw9GbeWFaElHg_gB0';

        async function callMatrix(action, payload = {}, signal = null) {
            try {
                const url = SUPABASE_URL + '/functions/v1/werewolf-engine';
                const fetchOptions = {
                    method: 'POST',
                    cache: 'no-store',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + SUPABASE_KEY
                    },
                    body: JSON.stringify(Object.assign({ action: action }, payload))
                };

                if (signal) fetchOptions.signal = signal;

                const response = await fetch(url, fetchOptions);
                return await response.json();
            } catch (error) {
                console.error("Matrix API Call Error:", error);
                throw error;
            }
        }

        const app = {
            state: {
                role: null,
                playerId: null,
                roomCode: null,
                time: 'day',
                players: [],
                selectedRolesPool: [],
                isSyncing: false,
                hasVotedLocal: false,

                lastSeenGmNews: null,

                // 🔥 KHAI BÁO CÁC BIẾN ẨN ĐỂ V8 ENGINE TỐI ƯU HÓA TỐC ĐỘ:
                isPolling: false,
                currentVoteTarget: null,
                lastSeenMorning: null,
                gameFlags: {},
                spareCards: [],
                nightCount: 0
            },
            pollingTimer: null,
            isFetchingGameState: false, // Van khóa chống DDoS

            masterRoles: {
                'Dân làng': { icon: '🌾', desc: 'Dân làng chiếm đại đa số, nhiệm vụ là tìm ra Ma Sói đội lốt người để đem đi treo cổ. Họ có thời gian ban ngày để đưa ra suy luận, phán đoán và sẽ chết nếu bị Ma Sói cắn trúng vào ban đêm.' },
                'Tiên tri': { icon: '👁️', desc: 'Buổi tối, Tiên tri được quản trò gọi dậy và có quyền đoán 1 người là Ma Sói, quản trò sẽ gật/giơ tay nếu đúng và lắc đầu nếu sai. Nhiệm vụ của Tiên tri là ra mặt đúng lúc, dùng lập luận hướng dân làng tìm Ma Sói và sẽ chết nếu bị Sói cắn.' },
                'Bảo vệ': { icon: '🛡️', desc: 'Mỗi đêm, Bảo vệ chọn cứu 1 người (có thể tự cứu mình) để người đó sống sót nếu bị Sói cắn. Bảo vệ không được cứu 1 người liên tiếp 2 đêm và người được bảo vệ vẫn có thể chết do bị Phù Thủy đầu độc.' },
                'Thợ săn': { icon: '🏹', desc: 'Mỗi đêm, Thợ săn chọn trước 1 người chơi. Nếu Thợ săn bị giết vào ban đêm, người được chọn sẽ chết theo, nhưng nếu người được chọn chết thì Thợ săn không chết. Nếu bị treo cổ ban ngày, Thợ săn có quyền chọn kéo 1 người bị treo cổ chung với mình.' },
                'Phù Thủy': { icon: '🧪', desc: 'Sở hữu 2 lọ thuốc (1 cứu người, 1 giết người). Ban đêm, Phù Thủy biết ai bị Sói cắn và có quyền chọn cứu người đó, hoặc dùng thuốc độc giết người mình nghi là Ma Sói (có thể dùng cả 2 lọ cùng lúc). Dùng xong bình sẽ mất chức năng tương ứng nhưng vẫn được gọi dậy mỗi đêm để biết ai chết.' },
                'Cupid (Thần tình yêu)': { icon: '💘', desc: 'Đầu ván chơi, Cupid ghép đôi 2 người bất kỳ (có thể tự ghép cho mình) để họ biết mặt và vai trò của nhau. Nếu họ khác phe, họ thành phe thứ 3 với nhiệm vụ là 2 người cuối cùng sống sót; nếu 1 trong 2 người chết, người kia cũng bắt buộc phải chết theo.' },
                'Cảnh sát trưởng (Trưởng làng)': { icon: '🎖️', desc: 'Là lá bài chức danh bầu chọn ban ngày dành cho bất kỳ ai. Phiếu bầu treo cổ của Cảnh sát trưởng được tính là 2 phiếu, khi chết có quyền chuyển chức danh này cho bất kỳ ai.' },
                'Cô Bé (Ti hí)': { icon: '​🫣', desc: 'Từ đêm thứ hai, khi sói thức dậy, Cô Bé có quyền hé mắt để nhận biết xem ai là sói, nhưng nếu để sói phát hiện ra thì sẽ bị giết chết ngay lập tức.' },
                'Ma Sói': { icon: '🐺', desc: 'Mỗi đêm, những người mang lá bài này thức dậy cùng nhau và chọn cắn chết 1 người. Sói có thể chọn không cắn ai hoặc tự tàn sát lẫn nhau.' },
                'Sói con': { icon: '🐾', desc: 'Chức năng giống hệt Ma Sói, nhưng khi Sói con chết, đêm hôm sau bầy Sói sẽ được quyền cắn hai người liên tục.' },
                'Sói trắng': { icon: '🐺❄️', desc: 'Thức dậy chung với Ma Sói để cắn người, nhưng cứ hai đêm một lần có quyền giết 1 con Ma Sói khác. Nhiệm vụ của Sói trắng là trở thành người duy nhất còn sống trên bàn chơi.' },
                'Kẻ bị nguyền': { icon: '🌓', desc: 'Ban đầu thuộc phe dân làng, nếu bị Sói cắn ban đêm sẽ không chết mà lập tức biến thành Sói.' },
                'Ăn Trộm': { icon: '🗝️', desc: 'Đêm đầu tiên, Ăn trộm được nhìn và chọn 1 trong 2 lá bài chức năng dư ở ngoài làm vai trò của mình. Tuy nhiên, nếu ít nhất 1 trong 2 lá đó là Sói, Ăn trộm bắt buộc phải chọn Sói.' },
                'Thằng ngốc': { icon: '🤡', desc: 'Nếu bị dân làng bầu treo cổ, Thằng ngốc lật lá bài lên để được tha thứ và tiếp tục sống nhưng sẽ mất vĩnh viễn quyền bầu chọn. Nếu là Cảnh sát trưởng thì phải chuyển quyền cho người khác, và vẫn sẽ chết nếu bị Sói cắn hoặc Thợ săn bắn.' },
                'Già làng': { icon: '👴', desc: 'Có hai mạng khi bị Ma Sói cắn, nhưng sẽ chết ngay nếu bị treo cổ, bị Thợ săn bắn hoặc bị Phù Thủy giết. Khi Già Làng chết, tất cả các vai trò đặc biệt của phe Dân (trừ Thợ Săn) đều bị mất năng lực.' },
                'Người thế thân': { icon: '🐐', desc: 'Nếu lượt bỏ phiếu treo cổ có kết quả hòa, Kẻ thế thân sẽ là người phải chết thay. Khi bị loại, người này có quyền chọn những ai được phép tham gia bình chọn vào sáng hôm sau.' },
                'Người thổi sáo': { icon: '🪈', desc: 'Mỗi đêm sẽ thôi miên 2 người, những người này sau đó được gọi dậy để biết mặt nhau. Người thổi sáo giành chiến thắng khi tất cả những người chơi còn sống đều đã bị thôi miên.' },
                'Kẻ đốt nhà': { icon: '🧨', desc: 'Một lần trong game, chọn đốt 1 căn nhà (đánh dấu bằng lá Hỏa hoạn), sáng hôm sau nhà đó bị loại và người ở đó thành Vô gia cư. Nếu đốt đúng nhà nạn nhân bị Sói cắn đêm đó, nạn nhân không chết và con Sói đầu tiên bên tay phải nạn nhân sẽ chết.' },
                'Con quạ': { icon: '🐦‍⬛', desc: 'Cuối mỗi đêm, chọn 1 người để đặt lời nguyền (không được chọn 1 người 2 đêm liên tiếp). Sáng hôm sau, người bị nguyền tự động nhận thêm 2 phiếu vote treo cổ.' },
                'Hai chị em': { icon: '👯‍♀️', desc: 'Thuộc phe dân làng, không có chức năng đặc biệt ngoài việc thức dậy cùng nhau vào đêm đầu tiên để nhận biết nhau, giúp tạo sự tin tưởng.' },
                'Ba anh em': { icon: '👨‍👦‍👦', desc: 'Thuộc phe dân làng, không có chức năng đặc biệt ngoài việc ba người thức dậy vào đêm đầu tiên để nhận biết mặt nhau.' },
                'Thiên sứ': { icon: '👼', desc: 'Thắng ngay lập tức nếu bị Sói cắn vào đêm đầu tiên hoặc bị dân làng treo cổ vào sáng đầu tiên. Nếu sống sót qua vòng đầu, Thiên sứ sẽ mất chức năng và trở thành một dân làng bình thường.' },
                'Thẩm phán lắp bắp': { icon: '⚖️', desc: 'Đêm đầu tiên, Thẩm Phán sẽ chỉ cho Quản Trò ám hiệu đặc biệt của mình. Một lần trong trò chơi, khi Thẩm Phán thực hiện ám hiệu, buổi sáng đó sẽ có 2 người bị treo cổ thay vì 1.' },
                'Hiệp sĩ kiếm gỉ': { icon: '🗡️', desc: 'Nếu bị sói cắn, Hiệp sĩ sẽ chết, nhưng con Sói gần nhất bên trái của hiệp sĩ sẽ bị thương và cũng sẽ chết sau 1 ngày đêm (Quản trò sẽ công bố Sói chết vào sáng hôm sau nữa).' },
                'Hồ ly': { icon: '🦊', desc: 'Mỗi đêm chọn 3 người chơi, nếu trong đó có ít nhất 1 Ma Sói thì Hồ ly giữ nguyên năng lực. Nếu không có Ma Sói nào trong 3 người, Hồ ly sẽ mất đi năng lực này vĩnh viễn.' },
                'Thần gấu': { icon: '🐻', desc: 'Quản trò sẽ ra dấu hiệu báo cho Thần gấu biết nếu một trong hai người ngồi ngay bên cạnh nhân vật này là Ma Sói.' },
                'Diễn viên': { icon: '🎭', desc: 'Quản trò sẽ lựa ra 3 lá chức năng. Mỗi đêm, Diễn viên có thể chọn ngẫu nhiên 1 trong 3 lá để thực hiện chức năng. Mỗi lá chỉ được chọn 1 lần trong trò chơi.' },
                'Hầu gái': { icon: '🧹', desc: 'Bất cứ khi nào trong trò chơi, có thể trao đổi thẻ của mình với nạn nhân bị làng bỏ phiếu treo cổ và đóng vai nhân vật đó cho đến cuối trò chơi.' },
                'Thành viên giáo phái': { icon: '✝️', desc: 'Thuộc 1 trong 2 phe được chia từ đầu ván (theo giới tính, tuổi tác...), chiến thắng khi dùng thành kiến lôi kéo dân làng loại bỏ được tất cả người chơi của phe đối địch.' },
                'Đứa trẻ hoang dã': { icon: '👶', desc: 'Vào đầu trò chơi, chọn một người chơi làm thần tượng. Nếu thần tượng này chết trong quá trình chơi, Đứa trẻ hoang dã sẽ lập tức biến thành Ma Sói.' },
                'Bán sói (Sói lai)': { icon: '🐕', desc: 'Khi bắt đầu trò chơi, nhân vật này được quyền tự lựa chọn muốn trở thành một Dân làng bình thường hay một Ma Sói.' },
                'Sói trùm': { icon: '👹', desc: 'Mỗi đêm sẽ được gọi để giết thêm 1 người cho đến khi có 1 con Sói trong đàn bị giết.' },
                'Sói quỷ': { icon: '👑', desc: 'Thuộc phe sói, một lần duy nhất trong trò chơi có thể biến nạn nhân vừa bị bầy sói cắn thành một Ma Sói thay vì để người đó chết.' },
                'Bà đồng': { icon: '🔮', desc: 'Tối đa 5 lần trong ván, được quyền chọn 1 trong 4 câu hỏi từ lá Gọi Hồn và chỉ định 1 người. Sáng hôm sau, người đó đọc to câu hỏi và người chết đầu tiên trong ván phải trả lời ngắn gọn "CÓ" hoặc "KHÔNG".' },
                'Cảnh sát': { icon: '👮', desc: 'Do Cảnh sát trưởng bổ nhiệm, phụ trách bốc và đọc các lá bài Sự kiện làm thông báo cho cả làng mỗi sáng. Cảnh sát trưởng có thể bãi chức và chọn Cảnh sát mới bất cứ lúc nào trước khi cả làng bỏ phiếu.' },
                'Nguyệt Nữ': { icon: '🌙', desc: 'Mỗi đêm chọn 1 người để vô hiệu hóa kỹ năng của người đó trong suốt đêm. Nguyệt Nữ không thể vô hiệu hóa chức năng của Bảo vệ và các kỹ năng áp dụng vào ban ngày.' },
                'Thầy thôi miên': { icon: '😵‍💫', desc: 'Mỗi đêm tỉnh dậy chọn mê hoặc 1 người (không được chọn 1 người liên tiếp 2 đêm). Nếu đêm đó Thầy thôi miên chết, người bị mê hoặc sẽ phải chết thay.' },
                'Dược sĩ': { icon: '💊', desc: 'Dược sĩ có 2 bình Mê Hồn Dược và Hồi Phục Dược. Mỗi đêm Dược sĩ sẽ được gọi dậy để sử dụng 2 bình (mỗi bình dùng 1 lần). Mê Hồn Dược làm 1 người mất quyền biểu quyết và không được nói chuyện 1 ngày. Hồi Phục Dược nếu quăng trúng Phù thủy thì sẽ được hồi bình cứu.' },
                'Người múa rối': { icon: '🎎', desc: 'Một lần duy nhất trong suốt ván chơi, có thể ép bầy Sói phải cắn 1 người do mình chỉ định, thậm chí có thể ép Sói cắn chính đồng loại của mình.' },
                'Sát thủ': { icon: '🥷', desc: 'Cứ mỗi 2 đêm, nếu số phiếu bầu treo cổ chỉ vào Sát thủ đạt đủ 4 phiếu, Sát thủ sẽ được quyền chỉ định giết chết 1 người.' },
                'Kị sĩ': { icon: '🐎', desc: 'Duy nhất một lần vào ban ngày trước khi treo cổ, được lật bài lên và chỉ định 1 người. Nếu người đó là Sói, Sói chết và ngày kết thúc; nếu không phải, Kị sĩ tự chết và trò chơi tiếp tục.' },
                'Người gọi hồn': { icon: '👻', desc: 'Mỗi đêm, được Quản trò gọi dậy để hỏi người chết gần nhất hãy chỉ vào kẻ mình nghi ngờ nhất. Người chết sẽ chỉ điểm nhưng tuyệt đối không được nói lời nào.' },
                'Sói lửa': { icon: '🔥', desc: 'Khi có ít nhất 1 Sói chết, đêm tiếp theo Sói lửa có thể tước năng lực vĩnh viễn của 1 người. Nếu có ít nhất 2 Sói chết, năng lực này được phép dùng thêm 1 lần nữa.' },
                'Sói Anh': { icon: '🐺🐺', desc: 'Đêm đầu tiên, bạn sẽ biết được Sói em là ai. Sau đó hằng đêm, Sói anh sẽ thức dậy cùng với đàn sói.' },
                'Sói Em': { icon: '🐺🐾', desc: 'Đêm đầu tiên, bạn sẽ biết được Sói anh là ai. Sau đó hằng đêm, Sói em không được dậy. Khi Sói anh chết, đêm sau đó Sói em sẽ được kêu dậy để giết 1 người. Kể từ đó, hằng đêm Sói em sẽ thức dậy cùng đàn sói. Trước khi thức dậy, Sói em không tính là Sói nên không thể bị Tiên tri, Hồ ly hay Thần gấu nhận diện.' },
                'Ảnh tử': { icon: '👤', desc: 'Vào đêm đầu tiên, Ảnh tử chọn một người. Trong đêm đó, nếu người được chọn còn sống, Ảnh tử sẽ có điều kiện thắng như Phe Dân Làng. Nếu người đó chết, Ảnh tử sẽ lấy lá bài của người đó và trở thành nhân vật đó.' },
                'Kẻ báo thù': { icon: '🩸', desc: 'Đêm đầu tiên, bạn sẽ chọn trở thành Sói hoặc Dân. Khi bạn chết, chọn 1 người bất kì, nếu người đó là Sói (nếu bạn chọn làm Dân) hoặc Dân (nếu bạn chọn làm Sói) thì người đó cũng sẽ chết theo (người bạn chọn khác phe với bạn sẽ chết cùng bạn).' }
            },

            // =======================================================================
            // 🔥 GIAO THỨC THAO TÚNG TRÌNH DUYỆT (OVERRIDE NATIVE ALERT & CONFIRM)
            // =======================================================================
            confirmAction(message) {
                return new Promise((resolve) => {
                    const modal = document.getElementById('custom-confirm');
                    document.getElementById('confirm-message').innerHTML = message.replace(/\n/g, '<br>');
                    modal.classList.add('active');

                    const btnYes = document.getElementById('btn-confirm-yes');
                    const btnNo = document.getElementById('btn-confirm-no');

                    const cleanup = () => {
                        modal.classList.remove('active');
                        btnYes.removeEventListener('click', onYes);
                        btnNo.removeEventListener('click', onNo);
                    };

                    const onYes = () => { cleanup(); resolve(true); };
                    const onNo = () => { cleanup(); resolve(false); };

                    btnYes.addEventListener('click', onYes);
                    btnNo.addEventListener('click', onNo);
                });
            },

            promptAction(message, defaultValue = "") {
                return new Promise((resolve) => {
                    const modal = document.getElementById('custom-prompt');
                    document.getElementById('prompt-message').innerHTML = message.replace(/\n/g, '<br>');
                    const inputEl = document.getElementById('prompt-input');
                    inputEl.value = defaultValue;
                    modal.classList.add('active');
                    inputEl.focus();

                    const btnYes = document.getElementById('btn-prompt-yes');
                    const btnNo = document.getElementById('btn-prompt-no');

                    const cleanup = () => {
                        modal.classList.remove('active');
                        btnYes.removeEventListener('click', onYes);
                        btnNo.removeEventListener('click', onNo);
                        inputEl.removeEventListener('keyup', onEnter);
                    };

                    const onYes = () => { cleanup(); resolve(inputEl.value); };
                    const onNo = () => { cleanup(); resolve(null); };
                    const onEnter = (e) => { if (e.key === 'Enter') onYes(); };

                    btnYes.addEventListener('click', onYes);
                    btnNo.addEventListener('click', onNo);
                    inputEl.addEventListener('keyup', onEnter);
                });
            },

            // 🔥 LÕI CÁO THỊ TỐI THƯỢNG: ĐÓNG BĂNG NHẬN THỨC, TỪ CHỐI TỰ HỦY
            showAnnouncement(title, message) {
                document.getElementById('announce-title').innerHTML = title;
                document.getElementById('announce-message').innerHTML = message.replace(/\n/g, '<br>');
                document.getElementById('modal-announcement').classList.add('active');
            },

            switchScreen(screenId) {
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
                document.getElementById(screenId).classList.add('active');

                // Tự động hiển thị nút Ghi chú và Tuyên bố chiến thắng trong menu thả xuống nếu là Quản trò
                const btnNote = document.getElementById('btn-menu-note');
                const btnWin = document.getElementById('btn-menu-declare-win');
                if (btnNote) {
                    if (this.state.role === 'gm') btnNote.style.display = 'flex';
                    else btnNote.style.display = 'none';
                }
                if (btnWin) {
                    if (this.state.role === 'gm' && screenId === 'screen-gm') btnWin.style.display = 'flex';
                    else btnWin.style.display = 'none';
                }
            },

            // =======================================================================
            // 🔥 LÕI PHẢN HỒI SINH HỌC (BIO-FEEDBACK LOCK CORE)
            // =======================================================================
            lockBtn(btn, loadingText = "⏳ ĐANG XỬ LÝ...") {
                if (!btn) return null;
                const state = {
                    html: btn.innerHTML,
                    transform: btn.style.transform,
                    filter: btn.style.filter,
                    disabled: btn.disabled
                };
                btn.disabled = true;
                btn.innerHTML = loadingText;
                btn.style.transform = "scale(0.95)";
                btn.style.filter = "brightness(0.7)";
                btn.style.cursor = "wait";
                return state;
            },
            unlockBtn(btn, state) {
                if (!btn || !state) return;
                btn.disabled = state.disabled;
                btn.innerHTML = state.html;
                btn.style.transform = state.transform;
                btn.style.filter = state.filter;
                btn.style.cursor = "pointer";
            },

            async createRoom() {
                const btn = document.getElementById('btn-create');
                const lockState = this.lockBtn(btn, "⏳ ĐANG TẠO PHÒNG...");
                try {
                    const res = await callMatrix('createRoom');
                    this.unlockBtn(btn, lockState);
                    if (res.status === 'success') {
                        this.state.role = 'gm';
                        this.state.roomCode = res.roomCode;
                        localStorage.setItem('werewolf_session', JSON.stringify({ role: 'gm', roomCode: res.roomCode, last_activity: Date.now() }));
                        document.getElementById('gm-room-id').innerText = res.roomCode;
                        this.switchScreen('screen-gm');
                        this.startPolling();
                    } else {
                        alert("Lỗi khi tạo phòng: " + res.message);
                    }
                } catch (err) {
                    this.unlockBtn(btn, lockState);
                    alert("Không thể kết nối Backend Server.");
                }
            },

            async joinRoom() {
                const room = document.getElementById('room-code').value.trim();
                const name = document.getElementById('player-name').value.trim();
                if (!room || !name) { alert('Bạn vui lòng nhập đầy đủ Mã Phòng và Tên.'); return; }

                const btn = document.getElementById('btn-join');
                const lockState = this.lockBtn(btn, "⏳ ĐANG ĐỘT NHẬP...");
                try {
                    const res = await callMatrix('joinRoom', { roomCode: room, playerName: name });
                    this.unlockBtn(btn, lockState);
                    if (res.status === 'success') {
                        this.state.role = 'player';
                        this.state.playerId = res.playerId;
                        this.state.roomCode = res.roomCode;
                        localStorage.setItem('werewolf_session', JSON.stringify({ role: 'player', playerId: res.playerId, roomCode: res.roomCode, playerName: name, last_activity: Date.now() }));
                        document.getElementById('player-room-info').innerText = `Mã phòng: ${res.roomCode} | Tên: ${name}`;
                        this.switchScreen('screen-player');
                        this.startPolling();
                    } else {
                        alert(res.message || "Vào phòng thất bại.");
                    }
                } catch (err) {
                    this.unlockBtn(btn, lockState);
                    alert("Không thể kết nối Backend.");
                }
            },

            async toggleGhostVision(btn = null) {
                this.state.isSyncing = true;
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = "⏳ ĐANG KẾT NỐI...";
                }
                
                try {
                    await callMatrix('toggleGhostVision', { roomCode: this.state.roomCode });
                    // Nút sẽ tự động được cập nhật màu sắc và chữ khi fetchGameState trả về cờ mới
                } catch (e) {
                    alert("⚠️ Lỗi mạng: Không thể đổi chế độ hồn ma! Hãy thử lại.");
                } finally {
                    if (btn) btn.disabled = false;
                    this.state.isSyncing = false;
                    this.fetchGameState();
                }
            },

            async toggleGameMode(btn = null) {
                this.state.isSyncing = true;
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = "⏳ ĐANG KẾT NỐI...";
                }
                
                try {
                    await callMatrix('toggleGameMode', { roomCode: this.state.roomCode });
                } catch (e) {
                    alert("⚠️ Lỗi mạng: Không thể đổi chế độ! Hãy thử lại.");
                } finally {
                    if (btn) btn.disabled = false;
                    this.state.isSyncing = false;
                    this.fetchGameState();
                }
            },

            async toggleTime(time, btn = null) {
                this.state.isSyncing = true;
                const lockState = this.lockBtn(btn, "⏳ ĐANG HÔ MƯA GỌI GIÓ...");
                if (time === 'night') {
                    this.state.players.forEach(p => delete p.pendingActions);
                }

                try {
                    await callMatrix('updateRoomTime', { roomCode: this.state.roomCode, time: time });
                    // 🔥 CHỈ KHI SERVER NHẬN LỆNH THÀNH CÔNG, GIAO DIỆN MỚI ĐƯỢC PHÉP ĐỔI MÀU!
                    this.applyTimeTheme(time);
                    this.state.time = time;
                    this.renderGMGrid();
                } catch (e) {
                    alert("⚠️ Lỗi mạng: Không thể thay đổi thời gian! Hãy thử lại.");
                } finally {
                    // Lệnh ân xá tuyệt đối: Dù thành công hay lỗi mạng, BẮT BUỘC phải mở khóa để hệ thống chạy tiếp!
                    this.unlockBtn(btn, lockState);
                    this.state.isSyncing = false;
                }
            },

            async confirmLeaveRoom() {
                if (await this.confirmAction("Bạn có chắc chắn muốn thoát phòng không? Hành động này không thể hoàn tác!")) {
                    this.leaveRoom();
                }
            },

            leaveRoom() {
                this.stopPolling();
                const currentRoom = this.state.roomCode;
                localStorage.removeItem('werewolf_session');
                localStorage.removeItem('werewolf_selected_roles');
                if (currentRoom) {
                    localStorage.removeItem('gmNotes_' + currentRoom);
                }

                // 🔥 BẮN NGƯ LÔI BÁO TỬ (Sử dụng .catch để không bị văng Unhandled Promise)
                if (this.state.roomCode) {
                    callMatrix('leaveRoom', {
                        roomCode: this.state.roomCode,
                        playerId: this.state.playerId,
                        role: this.state.role
                    }).catch(e => { /* Im lặng nuốt trọn lỗi nếu mất mạng */ });
                }

                // 🔥 RESET RAM VỀ TRẠNG THÁI XUẤT XƯỞNG
                this.state = {
                    role: null, playerId: null, roomCode: null, time: 'day', players: [], selectedRolesPool: [],
                    isSyncing: false, hasVotedLocal: false, isPolling: false, currentVoteTarget: null,
                    lastSeenMorning: null, gameFlags: {}, spareCards: [], nightCount: 0
                };

                this.switchScreen('screen-lobby');
            },

            realtimeChannel: null,

            startPolling() {
                this.stopPolling();
                this.state.isPolling = true; 

                // Lần đầu tự load state
                this.pollLoop();

                // Lắng nghe qua Supabase Realtime thay vì loop liên tục
                if (!this.realtimeChannel && window.supabase) {
                    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                    this.realtimeChannel = client.channel('room_' + this.state.roomCode)
                        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: 'room_code=eq.' + this.state.roomCode }, payload => {
                            if (this.state.isPolling) this.pollLoop();
                        })
                        .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'room_code=eq.' + this.state.roomCode }, payload => {
                            if (this.state.isPolling) this.pollLoop();
                        })
                        .subscribe((status) => {
                            if (status === 'SUBSCRIBED') {
                                console.log("🟢 Băng tần thời gian thực (Realtime) đã được thiết lập thành công!");
                            }
                        });
                }
            },

            stopPolling() {
                this.state.isPolling = false;
                if (this.pollingTimer) {
                    clearTimeout(this.pollingTimer);
                    this.pollingTimer = null;
                }
                if (this.realtimeChannel && window.supabase) {
                    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                    client.removeChannel(this.realtimeChannel);
                    this.realtimeChannel = null;
                }
            },

            async pollLoop() {
                if (!this.state.isPolling) return;

                // 🔥 VAN ÁP SUẤT TỐI THƯỢNG (ANTI-DDOS LOCK)
                if (this.isFetchingGameState) {
                    // Nếu đang fetch, ta hẹn gọi lại sau 100ms để không bỏ sót tín hiệu từ Realtime
                    if (this.pollingTimer) clearTimeout(this.pollingTimer);
                    this.pollingTimer = setTimeout(() => this.pollLoop(), 100);
                    return;
                }

                this.isFetchingGameState = true; // Khóa van an toàn

                try {
                    await this.fetchGameState();
                } catch (e) {
                    console.error("Trục trặc nơ-ron không gian, đang cố tái kết nối...");
                } finally {
                    this.isFetchingGameState = false; // Mở van khi đã nhận xong dữ liệu
                }
                
                // Đã loại bỏ thuật toán đàn hồi ép xung (350ms loop)
            },

            async fetchGameState() {
                if (!this.state.roomCode) return;

                // KHIÊN BẢO VỆ 1: Chặn gửi request nếu Quản trò đang thao tác
                if (this.state.isSyncing) return;

                // 🗡️ RÚT DAO MỔ: Tạo mới một Lõi Hành Quyết cho mỗi luồng quét
                this.pollingController = new AbortController();

                try {
                    const currentRequester = (this.state.role === 'gm') ? 'GM' : this.state.playerId;
                    const res = await callMatrix('getGameState', {
                        roomCode: this.state.roomCode,
                        requesterId: currentRequester
                    }, this.pollingController.signal); // Tiêm dây thần kinh sinh tử vào!

                    // KHIÊN BẢO VỆ 2 (CHÍ MẠNG): Tránh lỗi "bóng ma". 
                    // Nếu trong lúc chờ API trả về mà Quản trò lỡ bấm nút, LẬP TỨC HỦY BỎ dữ liệu cũ này!
                    if (this.state.isSyncing) return;

                    // Nếu nhận được lỗi từ máy chủ (phòng không tồn tại hoặc đã bị hủy)
                    if (res && res.status === 'error') {
                        if (this.state.role !== 'gm') {
                            alert("Quản trò đã hủy phòng hoặc phòng không còn tồn tại!");
                        }
                        this.leaveRoom();
                        return;
                    }

                    if (res && res.players) {
                        let hasChanges = false;
                        if (this.state.players.length !== res.players.length) hasChanges = true;

                        res.players.forEach(newP => {
                            const oldP = this.state.players.find(p => p.id === newP.id);
                            if (oldP) {
                                // 🔥 VÁ LỖI CÁ VÀNG: Giữ lại toàn bộ Mảng Đa Nhiệm khi hệ thống tự động làm mới
                                newP.pendingActions = oldP.pendingActions;

                                if (oldP.status !== newP.status || oldP.role !== newP.role) {
                                    hasChanges = true;
                                }

                                // 🔥 VÁ LỖI LUÂN HỒI: Chặn bắt cả Sống lẫn Chết không phân biệt Role hiện tại
                                if (this.state.playerId === newP.id) {
                                    // 1. ĐOẠT MẠNG (Từ Sống -> Chết)
                                    if (oldP.status !== 'Dead' && (newP.status === 'Dead' || newP.status === 'dead') && this.state.role === 'player') {
                                        alert(`Trời đã sáng...\nBạn đã tử nạn đêm qua!\nLý do: ${newP.nightAction || 'Bị thế lực hắc ám tiêu diệt'}.\n\nBạn sẽ hóa thành Hồn Ma để theo dõi ván đấu.`);
                                        this.switchToSpectatorMode();
                                    }
                                    // 2. HỒI SINH TRỞ LẠI (Từ Chết -> Sống khi Quản trò hồi sinh bất kỳ lúc nào)
                                    else if ((oldP.status === 'Dead' || oldP.status === 'dead') && newP.status === 'Alive' && (this.state.role === 'spectator' || this.state.role === 'player')) {
                                        this.state.role = 'player'; // Đảm bảo đóng vai trò người chơi
                                        this.switchScreen('screen-player'); // Kéo giật về màn hình Thẻ bài của họ
                                        alert("✨ PHÉP MÀU XUẤT HIỆN!\n\nQuản trò đã hồi sinh bạn! Bạn đã trở lại cõi sống với lá bài trên tay. Tiếp tục chiến đấu thôi!");
                                    }
                                }
                            } else {
                                hasChanges = true;
                            }
                        });

                        // 🔥 SỰ TỰ NHẬN THỨC CỦA KẺ BỊ ĐUỔI: 
                        // Nếu ta không còn là Quản trò, và ID của ta KHÔNG CÒN TỒN TẠI trong danh sách trả về từ Server -> Ta đã bị Xóa sổ!
                        if (this.state.role === 'player' || this.state.role === 'spectator') {
                            const iAmStillInMatrix = res.players.some(p => p.id === this.state.playerId);
                            if (!iAmStillInMatrix && this.state.playerId) {
                                alert("🚷 BẠN ĐÃ BỊ QUẢN TRÒ TRỤC XUẤT KHỎI PHÒNG!\n\nHành vi của bạn có thể đã vi phạm luật chơi. Bạn sẽ bị đẩy về Sảnh Chờ ngay bây giờ!");
                                this.leaveRoom(); // Đá văng ra sảnh ngay lập tức!
                                return; // Dừng toàn bộ mọi tính toán phía sau
                            }
                        }

                        this.state.players = res.players;
                        const livingCount = res.players.filter(p => p.status !== 'Dead' && p.status !== 'dead').length;
                        const elLivingCount = document.getElementById('player-living-count');
                        if (elLivingCount) {
                            const newText = `Số người sống: ${livingCount} 👁 (Chạm để xem)`;
                            // ĐÂY LÀ CHÌA KHÓA: Chỉ cập nhật khi con số thực sự thay đổi!
                            // Điều này giúp dòng chữ đứng im, không bị chớp nháy, trình duyệt sẽ nhận được cú bấm của bạn.
                            if (elLivingCount.innerText !== newText) {
                                elLivingCount.innerText = newText;
                            }
                        }
                        // Cập nhật bộ đếm đêm từ Backend
                        if (res.nightCount !== undefined) this.state.nightCount = res.nightCount;

                        // 🔥 KẾT NỐI DÂY THẦN KINH TỦY SỐNG 1: MA TRẬN THỜI GIAN VÀ ĐÀI PHÁT THANH
                        if (res.gameFlags) {
                            if (JSON.stringify(this.state.gameFlags) !== JSON.stringify(res.gameFlags)) hasChanges = true;

                            // 🚨 HỆ THỐNG PHÁT THANH TOÀN BẢN (GLOBAL MORNING ANNOUNCEMENT)
                            if (res.time === 'day' && res.gameFlags.newsNight && this.state.lastSeenMorning !== res.gameFlags.newsNight) {
                                this.state.lastSeenMorning = res.gameFlags.newsNight;

                                if (this.state.role !== 'gm') {
                                    setTimeout(() => {
                                        // 🗡️ GỌI CÁO THỊ TỐI THƯỢNG: Ép người chơi phải tự tay bấm "Đã ghi nhận"
                                        app.showAnnouncement(`🌅 BẢN TIN SÁNG NGÀY ${res.gameFlags.newsNight}`, res.gameFlags.morningNews);
                                    }, 500);
                                }
                            }

                            this.state.gameFlags = res.gameFlags;
                        }

                        // 🚨 BỘ THU SÓNG THẦN DỤ (GM GOD-MODE BROADCAST SENSOR)
                        if (res.gameFlags.gmNewsId && this.state.lastSeenGmNews !== res.gameFlags.gmNewsId) {
                            this.state.lastSeenGmNews = res.gameFlags.gmNewsId;

                            if (this.state.role !== 'gm') {
                                setTimeout(() => {
                                    // 🗡️ SẮC LỆNH TỪ QUẢN TRÒ: Đóng băng màn hình người chơi
                                    app.showAnnouncement("📢 SẮC LỆNH TỪ QUẢN TRÒ", res.gameFlags.gmNews);
                                }, 300);
                            }
                        }

                        // 🗝️ KẾT NỐI DÂY THẦN KINH TỦY SỐNG 2: KHO BÀI NỌC (CHO ĂN TRỘM & DIỄN VIÊN)
                        if (res.spareCards) {
                            this.state.spareCards = res.spareCards;
                        }
                        
                        // 👁️ CẬP NHẬT GIAO DIỆN NÚT HỒN MA VÀ CHẾ ĐỘ THỦ CÔNG CHO QUẢN TRÒ
                        if (this.state.role === 'gm') {
                            const btnGhost = document.getElementById('btn-ghost-vision');
                            if (btnGhost) {
                                let visionEnabled = (res.gameFlags && res.gameFlags.ghostVisionEnabled !== false);
                                if (visionEnabled) {
                                    btnGhost.innerHTML = '👁️ HỒN MA: ĐƯỢC XEM BÀI';
                                    btnGhost.style.background = '#9b59b6';
                                } else {
                                    btnGhost.innerHTML = '🙈 HỒN MA: BỊ BỊT MẮT';
                                    btnGhost.style.background = '#7f8c8d';
                                }
                                
                                // INJECT NÚT ĐỔI CHẾ ĐỘ TỰ ĐỘNG / THỦ CÔNG
                                let btnMode = document.getElementById('btn-manual-mode-toggle');
                                if (!btnMode) {
                                    btnMode = document.createElement('button');
                                    btnMode.id = 'btn-manual-mode-toggle';
                                    btnMode.onclick = () => app.toggleGameMode(btnMode);
                                    btnGhost.parentNode.insertBefore(btnMode, btnGhost.nextSibling);
                                }
                                let isManualMode = (res.gameFlags && res.gameFlags.isManualMode === true);
                                if (isManualMode) {
                                    btnMode.innerHTML = '⚙️ CƠ CHẾ: THỦ CÔNG';
                                    btnMode.style.background = '#d35400';
                                } else {
                                    btnMode.innerHTML = '⚙️ CƠ CHẾ: TỰ ĐỘNG';
                                    btnMode.style.background = '#2c3e50';
                                }
                            }
                        } else if (this.state.role === 'spectator') {
                            let visionEnabled = (res.gameFlags && res.gameFlags.ghostVisionEnabled !== false);
                            let visionText = visionEnabled ? "ĐƯỢC XEM BÀI" : "BỊ BỊT MẮT";
                            document.getElementById('gm-room-id').innerText = this.state.roomCode + " (HỒN MA - " + visionText + ")";
                        }

                        if (res.time) {
                            if (this.state.time !== res.time) {
                                this.state.time = res.time;
                                hasChanges = true;
                            }
                            // Bỏ qua mọi điều kiện, ÉP BỘ CSS LUÔN PHẢI GIỐNG VỚI SERVER!
                            // Khắc phục triệt để lỗi kẹt màu màn hình người chơi
                            this.applyTimeTheme(res.time);
                        }

                        // KIỂM TRA ĐỔI QUẢN TRÒ (GM)
                        if (this.state.role === 'player' && res.gameFlags && res.gameFlags.newGM === this.state.playerId) {
                            if (this.state.ignoreGMTransfer === this.state.playerId) {
                                // Nếu ta là người vừa nhường quyền, bỏ qua việc nhận vơ quyền
                            } else {
                                alert("👑 BẠN ĐÃ ĐƯỢC NHƯỜNG QUYỀN QUẢN TRÒ!");
                                this.state.role = 'gm';
                                this.state.playerId = null;
                                localStorage.setItem('werewolf_session', JSON.stringify({
                                    roomCode: this.state.roomCode,
                                    role: 'gm',
                                    last_activity: Date.now()
                                }));
                                document.getElementById('gm-room-id').innerText = this.state.roomCode;
                                this.switchScreen('screen-gm');
                                this.renderGMGrid(); // Vẽ lại giao diện Quản trò ngay lập tức
                                
                                // Gửi lệnh xóa cờ newGM
                                callMatrix('clearNewGMFlag', { roomCode: this.state.roomCode }).catch(console.error);
                                return;
                            }
                        }
                        else if (this.state.role === 'player' && this.state.ignoreGMTransfer) {
                            if (!res.gameFlags || res.gameFlags.newGM !== this.state.playerId) {
                                this.state.ignoreGMTransfer = null;
                                let session = JSON.parse(localStorage.getItem('werewolf_session'));
                                if (session) {
                                    delete session.ignoreGMTransfer;
                                    session.last_activity = Date.now();
                                    localStorage.setItem('werewolf_session', JSON.stringify(session));
                                }
                            }
                        }

                        // KIỂM TRA ĐIỀU KIỆN THẮNG
                        if (res.gameFlags && res.gameFlags.winner) {
                            if (this.state.winnerDisplayed !== res.gameFlags.winner) {
                                this.state.winnerDisplayed = res.gameFlags.winner;
                                this.showWinScreen(res.gameFlags.winner);
                            }
                        } else {
                            this.state.winnerDisplayed = null; // Khởi tạo lại trạng thái thắng khi phát bài ván mới
                        }

                        this.handleVoteUI(res.voteState);
                        
                        if (this.state.role === 'gm' && res.gameFlags && res.gameFlags.gmAlerts) {
                            this.handleGMAlerts(res.gameFlags.gmAlerts);
                        }

                        if (hasChanges) {
                            if (this.state.role === 'gm' || this.state.role === 'spectator') {
                                this.renderGMGrid();
                            } else if (this.state.role === 'player') {
                                this.updatePlayerView();
                            }
                        }

                        // 🔥 DUY TRÌ SỰ SỐNG (Bơm máu last_activity liên tục)
                        try {
                            let session = JSON.parse(localStorage.getItem('werewolf_session'));
                            if (session) {
                                session.last_activity = Date.now();
                                localStorage.setItem('werewolf_session', JSON.stringify(session));
                            }
                        } catch (e) {}
                    }
                } catch (err) {
                    console.error("Lỗi cập nhật trạng thái:", err);
                }
            },

            // ==========================================
            // LOGIC BỎ PHIẾU TREO CỔ
            // ==========================================
            voteTimerInterval: null,

            async startVote(targetId, btn = null) {
                if (!(await this.confirmAction("Bạn có chắc chắn muốn đưa người này lên giàn treo cổ? Toàn bộ dân làng sẽ có 90s để quyết định sinh tử."))) return;

                // 🔥 1. ẢO ẢNH QUANG HỌC (OPTIMISTIC UI): Đóng menu và bật ngay Bảng Vote cho Quản trò trong 0ms! KHÔNG CHỜ SERVER!
                this.closeGMActionMenu();
                const targetName = this.state.players.find(p => p.id === targetId)?.name || 'Người chơi';
                this.handleVoteUI({
                    targetId: targetId, targetName: targetName,
                    endTime: new Date().getTime() + 95000,
                    dieCount: 0, liveCount: 0,
                    totalLiving: this.state.players.filter(p => p.status !== 'Dead').length
                });

                this.state.isSyncing = true;
                // Vẫn khóa nút ngầm để bảo vệ bộ nhớ dù UI đã chuyển cảnh
                const lockState = this.lockBtn(btn, "⏳ ĐANG DỰNG GIÀN GIÁO...");

                try {
                    await callMatrix('startVote', { roomCode: this.state.roomCode, targetId: targetId });
                } catch (e) {
                    alert("⚠️ Lỗi mạng: Không thể dựng giàn giáo!");
                    document.getElementById('modal-vote').classList.remove('active'); // Lỗi thì gỡ ảo ảnh
                } finally {
                    this.unlockBtn(btn, lockState);
                    this.state.isSyncing = false;

                    // 🔥 2. CÚ SỐC ĐIỆN TOÀN CẦU: Xóa cờ kẹt, ép mọi thiết bị chớp lại dữ liệu lập tức!
                    this.isFetchingGameState = false;
                    if (this.pollingTimer) clearTimeout(this.pollingTimer);
                    this.pollLoop();
                }
            },

            async resolveVote(btn = null) {
                if (!btn) btn = document.getElementById('btn-resolve-vote');

                // 👁️ BƯỚC 1: LƯU KÝ ỨC & KÍCH HOẠT ẢO ẢNH (0ms)
                const modal = document.getElementById('modal-vote');
                modal.classList.remove('active'); // Đánh sập bảng vote ngay lập tức

                this.state.isSyncing = true;
                const lockState = { disabled: btn.disabled, html: btn.innerHTML, transform: btn.style.transform, filter: btn.style.filter };

                try {
                    // ⚡ BƯỚC 2: BẮN TÍN HIỆU NGẦM XUYÊN KHÔNG GIAN
                    const res = await callMatrix('resolveVote', { roomCode: this.state.roomCode });

                    // ✔️ BƯỚC 3A: CHÂN LÝ XÁC NHẬN! Ảo ảnh trở thành thực tại.
                    setTimeout(() => { this.showAnnouncement("⚖️ KẾT QUẢ PHÁN QUYẾT", res.message); }, 100);
                } catch (e) {
                    // ❌ BƯỚC 3B: THUẬT TOÁN ĐẢO NGƯỢC THỜI GIAN (ROLLBACK)! 
                    // Backend từ chối hoặc đứt cáp quang! Kéo ngược ảo ảnh về thực tại tàn khốc!
                    modal.classList.add('active'); // Giật Bảng Vote hiện lại lên màn hình!
                    alert("⚠️ CẢNH BÁO ĐỨT GÃY: Đường truyền bị xé toạc! Máy chủ chưa nhận được lệnh tử hình, vui lòng chốt lại!");
                } finally {
                    this.unlockBtn(btn, lockState);
                    this.state.isSyncing = false;

                    // 🔄 VỊ THẦN CHÂN LÝ 350MS: Quét sạch mọi tàn dư ảo ảnh, cưỡng chế đồng bộ lại với hầm ngầm Google!
                    this.isFetchingGameState = false;
                    if (this.pollingTimer) clearTimeout(this.pollingTimer);
                    this.pollLoop();
                }
            },

            async usePlayerSkill(skillCode, btn = null) {
                let targetEl = document.getElementById('skill-target-id');
                let targetId = targetEl ? targetEl.value : null;

                if (skillCode === 'KNIGHT_KILL' && !(await this.confirmAction("CẢNH BÁO TỬ THẦN: Bạn có chắc chắn muốn lật bài đâm người này? Đâm sai là BẠN SẼ CHẾT!"))) return;
                if (skillCode === 'SERVANT_SWAP' && !(await this.confirmAction("Bạn có chắc muốn vứt bỏ thân phận Đầy Tớ để đổi lấy lá bài của người chết?"))) return;

                this.state.isSyncing = true;
                const lockState = this.lockBtn(btn, "⏳ ĐANG THI TRIỂN...");

                try {
                    const res = await callMatrix('triggerPlayerSkill', { roomCode: this.state.roomCode, playerId: this.state.playerId, skillCode: skillCode, targetId: targetId });
                    alert(res.message);
                } catch (e) {
                    alert("Lỗi kết nối khi dùng kỹ năng!");
                }

                this.unlockBtn(btn, lockState);
                this.state.isSyncing = false;
                this.fetchGameState();
            },

            async transferGMRole(targetId, btn = null) {
                const newName = await this.promptAction('Nhập tên hiển thị mới của bạn (bạn sẽ chơi thế chỗ người này):');
                if (!newName || newName.trim() === "") return;
                
                if (!(await this.confirmAction(`Bạn có chắc muốn nhường vị trí Quản Trò cho người này và tham gia làm người chơi [${newName}]?`))) return;
                
                const lockState = this.lockBtn(btn, "⏳ ĐANG CHUYỂN GIAO...");
                this.state.isSyncing = true;
                
                // Đánh dấu để Quản trò cũ không tự động lấy lại quyền khi hàm pollGameState chạy
                this.state.ignoreGMTransfer = targetId;
                
                try {
                    const res = await callMatrix('transferGM', { roomCode: this.state.roomCode, targetId: targetId, newName: newName });
                    alert(res.message);
                    this.closeGMActionMenu();
                    
                    // Cập nhật local của Quản trò cũ
                    this.state.role = 'player';
                    this.state.playerId = targetId;
                    this.state.playerName = newName;
                    localStorage.setItem('werewolf_session', JSON.stringify({
                        roomCode: this.state.roomCode,
                        role: 'player',
                        playerId: targetId,
                        playerName: newName,
                        ignoreGMTransfer: targetId,
                        last_activity: Date.now()
                    }));
                    document.getElementById('player-room-info').innerText = `Mã phòng: ${this.state.roomCode} | Tên: ${newName}`;
                    
                    // === BỘ LỌC TẨY RỬA DỮ LIỆU QUẢN TRÒ CŨ ===
                    localStorage.removeItem('gmNotes_' + this.state.roomCode);
                    localStorage.removeItem('werewolf_selected_roles');
                    this.state.selectedRolesPool = [];
                    const gmPlayerGrid = document.getElementById('gm-player-grid');
                    if (gmPlayerGrid) gmPlayerGrid.innerHTML = '';
                    const gmActionList = document.getElementById('gm-action-list');
                    if (gmActionList) gmActionList.innerHTML = '';
                    const alertModal = document.getElementById('modal-gm-alert');
                    if (alertModal) alertModal.classList.remove('active');
                    // ==========================================

                    this.switchScreen('screen-player');

                } catch (e) { alert("Lỗi kết nối khi nhường quyền!"); }
                
                this.unlockBtn(btn, lockState);
                this.state.isSyncing = false;
                this.fetchGameState();
            },

            async kickPlayer(targetId, btn = null) {
                if (!(await this.confirmAction("⚠️ QUYỀN LỰC TỐI CAO: Bạn có chắc chắn muốn ĐUỔI kẻ này khỏi phòng không? Toàn bộ dữ liệu của hắn sẽ bị xóa vĩnh viễn khỏi ván đấu!"))) return;

                this.state.isSyncing = true;
                const lockState = this.lockBtn(btn, "⏳ ĐANG TRỤC XUẤT...");

                try {
                    const res = await callMatrix('kickPlayer', { roomCode: this.state.roomCode, targetId: targetId });
                    alert(res.message);
                    this.closeGMActionMenu();
                } catch (e) {
                    alert("Lỗi kết nối khi cố gắng trục xuất!");
                }

                this.unlockBtn(btn, lockState);
                this.state.isSyncing = false;
                this.fetchGameState(); // Cập nhật lại danh sách ngay lập tức
            },

            async castVote(choice) {
                this.state.hasVotedLocal = true;
                const acts = document.getElementById('vote-actions');
                const msg = document.getElementById('vote-status-msg');

                if (acts) acts.style.display = 'none';
                if (msg) {
                    msg.style.display = 'block';
                    msg.style.color = '#f1c40f';
                    msg.innerText = "⏳ Đang chen lấn gửi phiếu lên máy chủ...";
                }

                try {
                    const res = await callMatrix('castVote', { roomCode: this.state.roomCode, playerId: this.state.playerId, choice: choice });

                    // 🔥 CHỈ KHI MÁY CHỦ XÁC NHẬN "SUCCESS", PHIẾU MỚI ĐƯỢC CÔNG NHẬN
                    if (res.status === 'success') {
                        if (msg) {
                            msg.style.color = 'var(--success)';
                            msg.innerText = "✔️ Máy chủ đã ghi nhận phiếu. Đợi kết quả...";
                        }
                    } else {
                        // 💥 XUNG ĐỘT GOOGLE SHEETS! Bị văng ra ngoài, phải khôi phục nút bấm để vote lại!
                        if (msg) {
                            msg.style.color = 'var(--danger)';
                            msg.innerText = "❌ Mạng nghẽn! Phiếu bị rơi, hãy BẤM LẠI NGAY!";
                        }
                        if (acts) acts.style.display = 'flex';
                        this.state.hasVotedLocal = false; // Mở khóa!
                    }
                } catch (e) {
                    if (msg) {
                        msg.style.color = 'var(--danger)';
                        msg.innerText = "❌ Mất kết nối! Hãy kiểm tra mạng và BẤM LẠI NGAY!";
                    }
                    if (acts) acts.style.display = 'flex';
                    this.state.hasVotedLocal = false; // Mở khóa!
                }
            },
            
            async clearGMAlert(alertId, btn) {
                const lockState = this.lockBtn(btn, "⏳ Đang xác nhận...");
                try {
                    await callMatrix('clearGMAlert', { roomCode: this.state.roomCode, alertId: alertId });
                    const modal = document.getElementById('modal-gm-alert');
                    if (modal) modal.classList.remove('active');
                    this.state.activeAlertId = null;
                    document.body.style.overflow = '';
                } catch (e) {
                    alert("⚠️ Lỗi mạng, vui lòng thử lại!");
                } finally {
                    this.unlockBtn(btn, lockState);
                }
            },

            handleGMAlerts(alerts) {
                if (!alerts || alerts.length === 0) {
                    const modal = document.getElementById('modal-gm-alert');
                    if (modal) modal.classList.remove('active');
                    this.state.activeAlertId = null;
                    document.body.style.overflow = '';
                    return;
                }
                
                // Hiển thị alert đầu tiên trong mảng
                const firstAlert = alerts[0];
                if (this.state.activeAlertId === firstAlert.id) return; // Đang hiển thị alert này
                
                this.state.activeAlertId = firstAlert.id;
                
                let modal = document.getElementById('modal-gm-alert');
                if (!modal) {
                    // Tạo modal nếu chưa có
                    modal = document.createElement('div');
                    modal.id = 'modal-gm-alert';
                    modal.className = 'modal blocking-modal';
                    modal.style.zIndex = '9999';
                    modal.style.background = 'rgba(0, 0, 0, 0.9)';
                    modal.innerHTML = `
                        <div class="modal-content danger-theme">
                            <h2 style="color: #ff4757;">⚠️ THÔNG BÁO QUAN TRỌNG</h2>
                            <p id="gm-alert-msg" style="font-size: 18px; margin: 20px 0; font-weight: bold;"></p>
                            <button id="btn-gm-alert-confirm" class="btn-primary" style="background: #ff4757;">XÁC NHẬN ĐÃ NẮM THÔNG TIN</button>
                        </div>
                    `;
                    document.body.appendChild(modal);
                }
                
                document.getElementById('gm-alert-msg').innerText = firstAlert.msg;
                
                // Gắn sự kiện click
                const btn = document.getElementById('btn-gm-alert-confirm');
                btn.onclick = () => this.clearGMAlert(firstAlert.id, btn);
                
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            },

            handleVoteUI(voteState) {
                const modal = document.getElementById('modal-vote');

                // 1. KHIÊN BẢO VỆ: Nếu Server báo hủy vote, hoặc Đã sang Ban Đêm -> CƯỠNG CHẾ ĐÓNG CỬA SỔ!
                if (!voteState || this.state.time === 'night') {
                    modal.classList.remove('active');
                    if (this.voteTimerInterval) {
                        clearInterval(this.voteTimerInterval);
                        this.voteTimerInterval = null;
                    }
                    this.state.hasVotedLocal = false;
                    this.state.currentVoteTarget = null;
                    return; // Thoát ngay lập tức
                }

                modal.classList.add('active');
                document.getElementById('vote-target-name').innerText = voteState.targetName;

                // 2. KẾT NỐI ĐỒNG HỒ VŨ TRỤ (SERVER TIME)
                if (this.state.currentVoteTarget !== voteState.targetId) {
                    this.state.currentVoteTarget = voteState.targetId;
                    if (this.voteTimerInterval) clearInterval(this.voteTimerInterval);

                    this.voteTimerInterval = setInterval(() => {
                        // 🔥 ĐỒNG BỘ MÁY CHỦ: Lấy mốc thời gian của Google trừ đi thời gian hiện tại của điện thoại
                        let remain = Math.max(0, Math.floor((voteState.endTime - new Date().getTime()) / 1000));

                        const timerText = document.getElementById('vote-timer');
                        if (timerText) timerText.innerText = remain;

                        const progressBar = document.getElementById('vote-progress');
                        if (progressBar) {
                            const percent = (remain / 90) * 100;
                            progressBar.style.width = percent + '%';
                            if (remain > 30) {
                                progressBar.style.background = 'var(--success)';
                                progressBar.style.boxShadow = 'none';
                            } else if (remain > 10) {
                                progressBar.style.background = '#e67e22';
                            } else {
                                progressBar.style.background = 'var(--danger)';
                                progressBar.style.boxShadow = '0 0 15px var(--danger)';
                            }
                        }

                        // 🔥 HẾT GIỜ (CHẠM ĐÁY MÁY CHỦ): MÁY CHÉM THỜI GIAN HOẠT ĐỘNG!
                        if (remain === 0) {
                            clearInterval(this.voteTimerInterval);
                            this.voteTimerInterval = null;

                            // 4. LỆNH XÓA SỔ TUYỆT ĐỐI: Dù là Quản trò hay Người chơi, hết giờ là Cửa sổ Vote lập tức bốc hơi!
                            const modal = document.getElementById('modal-vote');
                            if (modal) modal.classList.remove('active');

                            if (this.state.role === 'gm' && !this.state.isSyncing) {
                                this.resolveVote(); // Quản trò ẩn danh rút cò súng xử lý ngầm
                            } else if (this.state.role === 'player') {
                                // Bắn một tia Toast nhẹ để người chơi biết đang chờ kết quả, trả lại sự trong trẻo cho màn hình
                                window.alert("⚖️ Đã hết thời gian biểu quyết! Phán quyết đang được định đoạt...");
                            }
                        }
                    }, 1000);
                }

                // 3. PHÂN QUYỀN GIAO DIỆN HIỂN THỊ (Phần này giữ nguyên logic của ngài)
                const acts = document.getElementById('vote-actions');
                const msg = document.getElementById('vote-status-msg');
                const gmPanel = document.getElementById('vote-gm-panel');
                acts.style.display = 'none';
                msg.style.display = 'none';
                gmPanel.style.display = 'none';

                if (this.state.role === 'gm') {
                    gmPanel.style.display = 'block';
                    document.getElementById('tally-total').innerText = voteState.totalLiving;
                    document.getElementById('tally-req').innerText = Math.floor(voteState.totalLiving / 2) + 1;
                    document.getElementById('tally-die').innerText = voteState.dieCount;
                    document.getElementById('tally-live').innerText = voteState.liveCount;
                    document.getElementById('btn-resolve-vote').innerText = "🔥 CHỐT KẾT QUẢ NGAY 🔥";
                } else {
                    const myInfo = this.state.players.find(p => p.id === this.state.playerId);
                    if (!myInfo || myInfo.status === 'Dead') {
                        msg.style.display = 'block';
                        msg.innerText = "Hồn Ma chỉ được phép quan sát phán quyết.";
                    } else if (myInfo.state && myInfo.state.revealedIdiot) {
                        msg.style.display = 'block';
                        msg.style.color = 'var(--danger)';
                        msg.innerText = "Bạn đã lật bài Thằng Ngốc! Bạn bị tước quyền bỏ phiếu vĩnh viễn.";
                    } else if (myInfo.state && myInfo.state.pharmaSleep) {
                        msg.style.display = 'block';
                        msg.style.color = 'var(--danger)';
                        msg.style.fontWeight = 'bold';
                        msg.innerText = "💊 BẠN ĐÃ BỊ CHUỐC THUỐC MÊ! Không thể biểu quyết!";
                    } else if (this.state.playerId === voteState.targetId) {
                        msg.style.display = 'block';
                        msg.style.color = 'var(--danger)';
                        msg.style.fontWeight = 'bold';
                        msg.innerText = "Bạn đang đứng trên giàn treo cổ! Cầu nguyện đi.";
                    } else if (myInfo.voteChoice || this.state.hasVotedLocal) {
                        msg.style.display = 'block';
                        msg.style.color = 'var(--success)'; // Cập nhật màu xanh an tâm
                        msg.style.fontWeight = 'normal';
                        msg.innerText = "✔️ Đã chốt phiếu. Không thể thay đổi!";
                    } else {
                        acts.style.display = 'flex';
                    }
                }
            },

            // THÊM MỚI HÀM NÀY NGAY BÊN DƯỚI fetchGameState
            switchToSpectatorMode() {
                this.state.role = 'spectator';
                this.switchScreen('screen-gm');
                document.querySelector('.gm-header .controls').style.display = 'none';
                document.getElementById('btn-ghost-leave').style.display = 'inline-block';
                document.getElementById('night-panel').style.display = 'none';
                // Đổi thông báo để họ biết họ có quyền năng gì
                let visionEnabled = (this.state.gameFlags && this.state.gameFlags.ghostVisionEnabled !== false);
                let visionText = visionEnabled ? "ĐƯỢC XEM BÀI" : "BỊ BỊT MẮT";
                document.getElementById('gm-room-id').innerText = this.state.roomCode + " (HỒN MA - " + visionText + ")";
                this.renderGMGrid();
            },

            showWinScreen(winner) {
                let overlay = document.getElementById('win-screen-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'win-screen-overlay';
                    overlay.style.position = 'fixed';
                    overlay.style.top = '0';
                    overlay.style.left = '0';
                    overlay.style.width = '100vw';
                    overlay.style.height = '100vh';
                    overlay.style.zIndex = '999999';
                    overlay.style.display = 'flex';
                    overlay.style.flexDirection = 'column';
                    overlay.style.justifyContent = 'center';
                    overlay.style.alignItems = 'center';
                    overlay.style.color = 'white';
                    overlay.style.fontFamily = "'Cinzel', 'Arial', sans-serif";
                    overlay.style.textShadow = "0 0 20px rgba(0,0,0,0.8)";
                    overlay.style.padding = "20px";
                    overlay.style.boxSizing = "border-box";
                    document.body.appendChild(overlay);
                }

                if (winner === 'VILLAGE') {
                    overlay.style.background = 'radial-gradient(circle, #2980b9, #2c3e50)';
                    overlay.innerHTML = `
                        <h1 style="font-size: clamp(1.8rem, 8vw, 3rem); text-shadow: 0 0 30px #f1c40f, 0 0 10px #f1c40f; color: #f1c40f; text-align: center; margin: 0;">✨ PHE DÂN CHIẾN THẮNG ✨</h1>
                        <p style="font-size: clamp(1.1rem, 5vw, 1.5rem); margin-top: 15px; text-align: center;">Toàn bộ Sói đã bị tiêu diệt!</p>
                        <button style="margin-top: 30px; padding: 10px 20px; width: 100%; max-width: 200px; box-sizing: border-box; font-size: 1.2rem; background: #f39c12; color: white; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 15px rgba(243, 156, 18, 0.5);" onclick="document.getElementById('win-screen-overlay').remove()">Đóng</button>
                    `;
                } else if (winner === 'WOLF') {
                    overlay.style.background = 'radial-gradient(circle, #c0392b, #2c3e50)';
                    overlay.innerHTML = `
                        <h1 style="font-size: clamp(1.8rem, 8vw, 3rem); text-shadow: 0 0 30px #ff0000, 0 0 10px #ff0000; color: #ff4757; text-align: center; margin: 0;">🐺 PHE SÓI CHIẾN THẮNG 🐺</h1>
                        <p style="font-size: clamp(1.1rem, 5vw, 1.5rem); margin-top: 15px; text-align: center;">Số lượng Sói đã áp đảo Dân Làng!</p>
                        <button style="margin-top: 30px; padding: 10px 20px; width: 100%; max-width: 200px; box-sizing: border-box; font-size: 1.2rem; background: #e74c3c; color: white; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 15px rgba(231, 76, 60, 0.5);" onclick="document.getElementById('win-screen-overlay').remove()">Đóng</button>
                    `;
                } else if (winner === 'THIRD_PARTY') {
                    overlay.style.background = 'radial-gradient(circle, #8e44ad, #2c3e50)';
                    overlay.innerHTML = `
                        <h1 style="font-size: clamp(1.8rem, 8vw, 3rem); text-shadow: 0 0 30px #9b59b6, 0 0 10px #9b59b6; color: #e056fd; text-align: center; margin: 0;">🔮 PHE THỨ 3 CHIẾN THẮNG 🔮</h1>
                        <p style="font-size: clamp(1.1rem, 5vw, 1.5rem); margin-top: 15px; text-align: center;">Thế lực bóng tối đã thao túng tất cả!</p>
                        <button style="margin-top: 30px; padding: 10px 20px; width: 100%; max-width: 200px; box-sizing: border-box; font-size: 1.2rem; background: #9b59b6; color: white; border: none; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 15px rgba(155, 89, 182, 0.5);" onclick="document.getElementById('win-screen-overlay').remove()">Đóng</button>
                    `;
                }
            },

            revealCard() {
                const card = document.querySelector('.card-inner');
                if (card) card.classList.add('is-flipped');
            },
            hideCard() {
                const card = document.querySelector('.card-inner');
                if (card) card.classList.remove('is-flipped');
            },

            updatePlayerView() {
                const me = this.state.players.find(p => p.id === this.state.playerId);
                if (!me) return;

                const roleNameEl = document.getElementById('role-name');
                const roleIconEl = document.getElementById('role-icon');
                const roleDescEl = document.getElementById('role-desc');
                const pStatusEl = document.getElementById('player-status-text');

                if (me.status === 'Dead') {
                    pStatusEl.innerHTML = "<span style='color: var(--danger); font-weight: bold;'>BẠN ĐÃ HY SINH! (ĐANG LÀ HỒN MA)</span>";
                }

                // 🔥 CẬP NHẬT BẢNG CÁO THỊ TỬ THẦN
                const newsEl = document.getElementById('player-morning-news');
                if (newsEl) {
                    if (this.state.time === 'day' && this.state.gameFlags && this.state.gameFlags.morningNews) {
                        newsEl.style.display = 'block';
                        newsEl.innerHTML = `<b style="color: var(--text-color);">🌅 TỔNG KẾT NGÀY ${this.state.gameFlags.newsNight}:</b><br><span style="color: ${this.state.gameFlags.morningNews.includes('bình yên') ? 'var(--success)' : 'var(--danger)'};">${this.state.gameFlags.morningNews}</span>`;

                        if (this.state.gameFlags.morningNews.includes('bình yên')) {
                            newsEl.style.borderLeftColor = 'var(--success)';
                            newsEl.style.background = 'rgba(46, 204, 113, 0.15)';
                        } else {
                            newsEl.style.borderLeftColor = 'var(--danger)';
                            newsEl.style.background = 'rgba(231, 76, 60, 0.15)';
                        }
                    } else {
                        newsEl.style.display = 'none'; // Giấu đi khi màn đêm buông xuống
                    }
                }

                const roleInfo = this.masterRoles[me.role];
                if (roleInfo) {
                    roleNameEl.innerText = me.role;
                    roleIconEl.innerText = roleInfo.icon;
                    roleDescEl.innerText = roleInfo.desc;
                } else if (me.role === 'Chưa có') {
                    roleNameEl.innerText = "Chờ Phát Bài";
                    roleIconEl.innerText = "⏳";
                    roleDescEl.innerText = "Quản trò đang chuẩn bị bộ bài cho trò chơi.";
                } else {
                    roleNameEl.innerText = me.role;
                    roleIconEl.innerText = "❓";
                    roleDescEl.innerText = "Chức năng chưa có trong từ điển hiển thị.";
                }

                // ========================================================
                // 🔥 ENGINE KIỂM SOÁT KỸ NĂNG CHỦ ĐỘNG TRÊN MÀN NGƯỜI CHƠI
                // ========================================================
                const skillArea = document.getElementById('player-active-skills');
                skillArea.innerHTML = '';
                skillArea.style.display = 'none';

                if (me.status !== 'Dead') {

                    // [CẤY GHÉP LÕI GIAI ĐOẠN 3]: QUYỀN NĂNG ĐỘC LẬP TỰ QUYẾT ĐỊNH
                    if (this.state.time === 'night' && this.state.nightCount === 0) {

                        // 🐺 ĐẶC QUYỀN CHÓ SÓI (BÁN SÓI): Lựa chọn bản ngã
                        if (me.role === 'Bán sói (Sói lai)' && !me.state.hasChosenFaction && (!this.state.gameFlags || !this.state.gameFlags.isManualMode)) {
                            skillArea.style.display = 'block';
                            skillArea.innerHTML += `
                    <div class="glass-panel" style="margin-top: 5px; border-color: #f39c12; background: rgba(0,0,0,0.85); padding: 20px; animation: pulse 2s infinite; border-width: 2px;">
                        <h4 style="color: #f39c12; margin-top:0; font-size: 20px; letter-spacing: 1px;">🐺 ĐÁNH THỨC BẢN NĂNG</h4>
                        <p style="font-size: 14px; color: #ecf0f1; margin-bottom: 20px; line-height: 1.5;">Đêm nay là thời khắc định mệnh. Bạn muốn tiếp tục làm một con người bình thường yếu đuối, hay chấp nhận lời nguyền để hóa thân thành dã thú khát máu?</p>
                        <div style="display: flex; gap: 12px;">
                            <button class="btn-success" style="box-shadow: 0 5px 15px rgba(46,204,113,0.4);" onclick="app.usePlayerSkill('WOLFDOG_HUMAN', this)">🌾 LÀM DÂN</button>
                            <button class="btn-danger" style="box-shadow: 0 5px 15px rgba(231,76,60,0.5);" onclick="app.usePlayerSkill('WOLFDOG_WOLF', this)">🐺 LÀM SÓI</button>
                        </div>
                    </div>
                    `;
                        }

                        // 🩸 KẺ BÁO THÙ: Lựa chọn Phe
                        if (me.role === 'Kẻ báo thù' && !me.state.avengerFaction && (!this.state.gameFlags || !this.state.gameFlags.isManualMode)) {
                            skillArea.style.display = 'block';
                            skillArea.innerHTML += `
                    <div class="glass-panel" style="margin-top: 5px; border-color: #c0392b; background: rgba(0,0,0,0.85); padding: 20px; animation: pulse 2s infinite; border-width: 2px;">
                        <h4 style="color: #c0392b; margin-top:0; font-size: 20px; letter-spacing: 1px;">⚔️ LỜI THỀ ĐỘC ĐỊA</h4>
                        <p style="font-size: 14px; color: #ecf0f1; margin-bottom: 20px; line-height: 1.5;">Đêm nay, hãy thề độc trước các vị thần. Bạn sẽ chọn phe nào để trung thành? Và hãy nhớ, khi bạn ngã xuống, một kẻ thuộc phe ĐỐI LẬP bị ngắm trúng sẽ phải bỏ mạng theo bạn!</p>
                        <div style="display: flex; gap: 12px;">
                            <button class="btn-success" style="box-shadow: 0 5px 15px rgba(46,204,113,0.4);" onclick="app.usePlayerSkill('AVENGER_HUMAN', this)">🧑 PHE DÂN</button>
                            <button class="btn-danger" style="box-shadow: 0 5px 15px rgba(231,76,60,0.5);" onclick="app.usePlayerSkill('AVENGER_WOLF', this)">🐺 PHE SÓI</button>
                        </div>
                    </div>
                    `;
                        }
                    }

                    // 🗝️ ĐẶC QUYỀN ĂN TRỘM: NHÌN THẤU BÀI NỌC VÀ BỊ ÉP BUỘC
                    if (me.role === 'Ăn Trộm' && this.state.time === 'night' && this.state.nightCount === 0 && !me.state.hasStolen && (!this.state.gameFlags || !this.state.gameFlags.isManualMode)) {
                        let spares = this.state.spareCards || [];
                        if (spares.length === 2) {
                            // Logic Tàn Nhẫn: Cứ dính Sói hoặc các loại biến thể Sói là BẮT BUỘC phải lấy
                            let wolfCard = spares.find(r => r.toLowerCase().includes('sói') || r === 'Kẻ bị nguyền' || r === 'Đứa trẻ hoang dã');

                            let btnHtml = '';
                            if (wolfCard) {
                                btnHtml = `
                        <p style="color: var(--danger); font-size: 13px; font-weight: bold; margin-bottom: 10px;">⚠️ LỜI NGUYỀN HUYẾT NHỤC: Có Sói trong Bài Nọc! Bạn BẮT BUỘC phải chọn Sói!</p>
                        <button class="btn-danger" style="box-shadow: 0 0 15px rgba(231,76,60,0.8);" onclick="app.usePlayerSkill('THIEF_STEAL_${wolfCard}', this)">🐺 CHẤP NHẬN ĐỊNH MỆNH: ${wolfCard}</button>`;
                            } else {
                                btnHtml = `
                        <p style="font-size: 12px; color: #ccc; margin-bottom: 10px;">Bạn được quyền tự do chọn 1 trong 2 con đường:</p>
                        <div style="display: flex; gap: 10px;">
                            <button class="btn-success" onclick="app.usePlayerSkill('THIEF_STEAL_${spares[0]}', this)">LẤY: ${spares[0]}</button>
                            <button class="btn-primary" onclick="app.usePlayerSkill('THIEF_STEAL_${spares[1]}', this)">LẤY: ${spares[1]}</button>
                        </div>`;
                            }

                            skillArea.style.display = 'block';
                            skillArea.innerHTML += `
                    <div class="glass-panel" style="margin-top: 10px; border-color: #9b59b6; background: rgba(0,0,0,0.9); padding: 15px; border-width: 2px;">
                        <h4 style="color: #9b59b6; margin-top:0;">🗝️ TẦM NHÌN ĂN TRỘM</h4>
                        <p style="font-size: 14px; color: white; margin-bottom: 5px;">2 lá bài bị vứt bỏ ngoài rìa làng là:</p>
                        <p style="font-size: 16px; font-weight: bold; color: #f1c40f;">[${spares[0]}] & [${spares[1]}]</p>
                        ${btnHtml}
                    </div>
                    `;
                        }
                    }

                    // 🎭 ĐẶC QUYỀN DIỄN VIÊN: TRÁO ĐỔI NHÂN PHẬN (CHỈ 3 ĐÊM ĐẦU)
                    let isOriginalActor = me.role === 'Diễn viên' || (me.state && me.state.originalRole === 'Diễn viên');
                    if (isOriginalActor && this.state.time === 'night' && (!this.state.gameFlags || !this.state.gameFlags.isManualMode)) {
                        let spares = this.state.spareCards || [];
                        // Lọc bỏ những lá bài đã bị đào thải hoặc đã được sử dụng
                        let validSpares = spares.filter(r => !r.includes('Đã đào thải') && !r.includes('[Đã dùng]'));

                        if (validSpares.length > 0) {
                            let buttons = validSpares.map(r => `<button class="btn-primary" style="margin: 4px; box-shadow: 0 4px 10px rgba(52,152,219,0.4);" onclick="app.usePlayerSkill('ACTOR_SWAP_${r}', this)">Nhập vai: ${r}</button>`).join('');

                            skillArea.style.display = 'block';
                            skillArea.innerHTML += `
                    <div class="glass-panel" style="margin-top: 10px; border-color: #3498db; background: rgba(0,0,0,0.85); padding: 15px;">
                        <h4 style="color: #3498db; margin-top:0;">🎭 TỦ ĐỒ DIỄN VIÊN</h4>
                        <p style="font-size: 13px; color: #ecf0f1; margin-bottom: 10px;">Bạn có muốn tạm vứt bỏ thân phận Diễn Viên để lấy 1 trong các lá bài dự phòng này không? Mỗi lá chỉ được chọn 1 lần duy nhất, sang đêm sau bạn sẽ tự động quay về Diễn Viên.</p>
                        <div style="display: flex; flex-wrap: wrap; justify-content: center;">
                            ${buttons}
                        </div>
                    </div>
                    `;
                        }
                    }

                    // KỸ NĂNG 1: KỊ SĨ (Lật bài đâm sói ban ngày)
                    if (me.role === 'Kị sĩ' && !me.state.usedKnight && this.state.time === 'day' && (!this.state.gameFlags || !this.state.gameFlags.isManualMode)) {
                        skillArea.style.display = 'block';
                        let options = this.state.players.filter(p => p.status !== 'Dead' && p.id !== me.id).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
                        skillArea.innerHTML = `
                        <div class="glass-panel" style="margin-top: 5px; border-color: var(--danger); padding: 15px;">
                            <h4 style="color: var(--danger); margin-top:0;">🐎 ĐẶC QUYỀN KỊ SĨ</h4>
                            <p style="font-size: 13px; margin-bottom: 10px;">Ban ngày có quyền lật bài để đâm 1 kẻ khả nghi. Trúng Sói -> Sói chết. Sai -> Bạn tự sát.</p>
                            <select id="skill-target-id" style="width:100%; padding: 10px; margin-bottom: 15px; border-radius: 8px; font-size:16px;">${options}</select>
                            <button class="btn-danger" style="box-shadow: 0 0 15px rgba(231,76,60,0.5);" onclick="app.usePlayerSkill('KNIGHT_KILL', this)">⚔️ LẬT BÀI ĐÂM SÓI</button>
                        </div>
                    `;
                    }

                    // KỸ NĂNG 2: ĐẦY TỚ TẬN TỤY (Cướp bài kẻ bị treo cổ / chết chùm)
                    if (me.role === 'Hầu gái' && (!this.state.gameFlags || !this.state.gameFlags.isManualMode)) {
                        let dayDeaths = (this.state.gameFlags && this.state.gameFlags.dayDeaths) ? this.state.gameFlags.dayDeaths : [];
                        let deadPlayers = this.state.players.filter(p => dayDeaths.includes(p.id));
                        
                        if (deadPlayers.length > 0) {
                            let options = deadPlayers.map(p => `<option value="${p.id}">${p.name} (Tử nạn)</option>`).join('');
                            
                            skillArea.style.display = 'block';
                            skillArea.innerHTML = `
                            <div class="glass-panel" style="margin-top: 5px; border-color: var(--primary); padding: 15px; background: rgba(52, 152, 219, 0.1);">
                                <h4 style="color: var(--primary); margin-top:0; font-size: 20px;">🧹 ĐẦY TỚ TẬN TỤY</h4>
                                <p style="font-size: 14px; font-weight: bold;">Có người vừa ngã xuống vào ban ngày!</p>
                                <p style="font-size: 12px; margin-bottom: 15px;">Hãy kích hoạt ngay để cướp thẻ và lột xác dưới thân phận của họ.</p>
                                <select id="skill-target-id" style="width:100%; padding: 10px; margin-bottom: 15px; border-radius: 8px; font-size:16px;">
                                    ${options}
                                </select>
                                <button class="btn-success" style="box-shadow: 0 0 15px rgba(46,204,113,0.5);" onclick="app.usePlayerSkill('SERVANT_SWAP', this)">♻️ ĐỔI THẺ NGAY</button>
                            </div>
                        `;
                        }
                    }

                    // ========================================================
                    // 🔥 HỆ THỐNG "BÁO MỘNG" BÍ MẬT KỂ TỪ ĐÊM THỨ 1
                    // ========================================================
                    if (this.state.time === 'night' && this.state.nightCount >= 1) {
                        let secretMsgs = [];

                        // 1. Thần Tình Yêu (Thấy người tình & BIẾT RÕ VAI TRÒ)
                        if (me.state && me.state.loverId) {
                            let lover = this.state.players.find(p => p.id === me.state.loverId);
                            if (lover) secretMsgs.push(`💞 Người tình sinh tử của bạn là: <b>${lover.name}</b> <i style="color: var(--danger); font-size: 12px;">(${lover.role})</i>`);
                        }

                        // 2. Hội nhóm (Chị em, Anh em & BIẾT RÕ VAI TRÒ)
                        if (['Hai chị em', 'Ba anh em'].includes(me.role)) {
                            let sibs = this.state.players.filter(p => p.role === me.role && p.id !== me.id);
                            if (sibs.length > 0) secretMsgs.push(`👯‍♀️ Đồng bọn huyết thống: <b>${sibs.map(s => `${s.name} <span style="font-size: 12px; opacity: 0.8;">(${s.role})</span>`).join(', ')}</b>`);
                        }

                                                // 2.5 Sói Anh / Sói Em
                        if (me.role === 'Sói Anh') {
                            let em = this.state.players.find(p => p.role === 'Sói Em');
                            if (em) secretMsgs.push(`🐺🐾 Sói em của bạn là: <b>` + em.name + `</b> <span style="color: #e67e22; font-size: 12px;">(Sói Em)</span>`);
                        }
                        if (me.role === 'Sói Em') {
                            let anh = this.state.players.find(p => p.role === 'Sói Anh');
                            if (anh) secretMsgs.push(`🐺🐺 Sói anh của bạn là: <b>` + anh.name + `</b> <span style="color: #e67e22; font-size: 12px;">(Sói Anh)</span>`);
                        }

                        // 3. Bầy Sói (Thấy đồng loại & BIẾT CHÍNH XÁC LOẠI SÓI GÌ)
                        if (me.role.toLowerCase().includes('sói') && me.role !== 'Bán sói (Sói lai)' && me.role !== 'Kẻ bị nguyền') {
                            let wolves = this.state.players.filter(p => p.role.toLowerCase().includes('sói') && p.id !== me.id && p.role !== 'Bán sói (Sói lai)' && p.role !== 'Kẻ bị nguyền' && p.role !== 'Sói trắng');
                            if (wolves.length > 0) secretMsgs.push(`🐺 Bầy Sói của bạn gồm: <b>${wolves.map(s => `${s.name} <span style="color: #e67e22; font-size: 12px;">(${s.role})</span>`).join(', ')}</b>`);
                        }

                        // 4. 👤 THÔNG BÁO LỘT XÁC CHO ẢNH TỬ
                        if (me.state && me.state.shadowInheritedRole) {
                            secretMsgs.push(`👤 NGHI THỨC HOÀN TẤT: Mục tiêu của Bạn đã ngã xuống! Bạn cướp đoạt sinh mệnh và lột xác thành <b>${me.state.shadowInheritedRole}</b>.`);
                        }

                        // 5. 🪈 KẺ BỊ THÔI MIÊN TỰ NHẬN THỨC
                        if (me.state && me.state.piperCharmed) {
                            secretMsgs.push(`🪈 BẢN NHẠC TỬ THẦN: Bạn đã bị Người Thổi Sáo thôi miên. Thể xác này không còn là của bạn nữa!`);
                        }

                        // Hiển thị khung Bí mật nếu có dữ liệu
                        if (secretMsgs.length > 0) {
                            skillArea.style.display = 'block';
                            let msgHtml = secretMsgs.map(m => `<p style="font-size: 14px; margin-bottom: 8px;">${m}</p>`).join('');

                            // Cấy thêm HTML vào khung skillArea thay vì ghi đè
                            skillArea.innerHTML += `
                            <div class="glass-panel secret-info-container" style="margin-top: 15px; border-color: #f39c12; background: rgba(0,0,0,0.6); padding: 15px;"
                                 onmousedown="this.classList.add('is-revealed')" 
                                 onmouseup="this.classList.remove('is-revealed')" 
                                 onmouseleave="this.classList.remove('is-revealed')" 
                                 ontouchstart="this.classList.add('is-revealed')" 
                                 ontouchend="this.classList.remove('is-revealed')">
                                <h4 style="color: #f1c40f; margin-top:0; font-size: 18px;">👁️ THÔNG TIN MẬT</h4>
                                <div class="secret-info-overlay">👆 Chạm & Giữ để xem</div>
                                <div class="secret-info-content" style="color: #ecf0f1; text-align: left; padding: 0 10px;">${msgHtml}</div>
                            </div>
                        `;
                        }
                    }
                }
            },

            applyTimeTheme(time) {
                const body = document.getElementById('app-body');
                const nightPanel = document.getElementById('night-panel');
                const pStatusEl = document.getElementById('player-status-text');

                // 🔥 BÀN TAY SẮT: Xóa sạch cả hai Theme để tránh bóng ma CSS, sau đó ép Theme chuẩn vào!
                body.classList.remove('theme-day', 'theme-night');
                body.classList.add(`theme-${time}`);

                if (time === 'night') {
                    if (this.state.role === 'gm') nightPanel.style.display = 'block';
                    if (pStatusEl && this.state.role === 'player') pStatusEl.innerText = "Màn đêm buông xuống. Hãy giữ im lặng...";
                } else {
                    if (this.state.role === 'gm') nightPanel.style.display = 'none';
                    if (pStatusEl && this.state.role === 'player') pStatusEl.innerText = "Trời đã sáng. Mọi người thức dậy!";
                }
            },

            showLivingPlayers() {
                const livingPlayers = this.state.players.filter(p => p.status !== 'Dead' && p.status !== 'dead');
                const listHtml = livingPlayers.map(p => `<span style="display: inline-block; padding: 5px 12px; margin: 4px; background: rgba(46, 204, 113, 0.15); border: 1px solid var(--success); border-radius: 20px; color: var(--success); font-weight: bold; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">${p.name}</span>`).join('');
                const messageHtml = `<p style="font-weight: bold; margin-bottom: 15px; color: var(--primary); font-size: 18px; text-align: center;">Tổng cộng: ${livingPlayers.length} người</p><div style="max-height: 45vh; overflow-y: auto; text-align: center; padding: 5px;">${listHtml}</div>`;
                this.showAnnouncement('👁️ NHỮNG NGƯỜI CÒN SỐNG', messageHtml);
            },

            renderGMGrid() {
                const grid = document.getElementById('gm-player-grid');
                grid.innerHTML = '';
                document.getElementById('gm-player-count-text').innerText = `Số người chơi hiện tại: ${this.state.players.length}`;

                // 🔥 ĐỒNG BỘ THỜI GIAN THỰC TUYỆT ĐỐI (LIVE SYNC)
                // Mỗi khi có một người vừa Join phòng, hệ thống tự động ép Khung Chọn Bài cập nhật lại con số!
                this.updateRoleCounter();

                let sortedPlayers = [...this.state.players];
                sortedPlayers.sort((a, b) => {
                    const isDeadA = (a.status === 'Dead' || a.status === 'dead');
                    const isDeadB = (b.status === 'Dead' || b.status === 'dead');
                    if (isDeadA !== isDeadB) return isDeadA ? 1 : -1;
                    
                    const getGroupId = (p) => {
                        if (p.role && (p.role.toLowerCase().includes('sói') || p.role === 'Đứa trẻ hoang dã' || p.role === 'Kẻ bị nguyền')) return 1;
                        if (p.state && p.state.loverId) return 2;
                        if (p.state && p.state.piperCharmed) return 3;
                        return 99;
                    };
                    const groupDiff = getGroupId(a) - getGroupId(b);
                    if (groupDiff !== 0) return groupDiff;
                    
                    // Nhóm các nhân vật cùng vai trò lại gần nhau để quản trò dễ nhìn
                    if (a.role && b.role) return a.role.localeCompare(b.role);
                    return 0;
                });

                sortedPlayers.forEach(p => {
                    const isDead = (p.status === 'Dead' || p.status === 'dead');

                    const el = document.createElement('div');
                    el.className = `gm-player-card ${isDead ? 'dead' : ''}`;
                    el.id = `gm-card-${p.id}`;

                    let relationTags = '';

                    // 🔥 TÌNH BÁO TOÀN DIỆN CHO QUẢN TRÒ (MỌI TRẠNG THÁI & LIÊN KẾT)
                    if (p.state) {
                        if (p.state.loverId) {
                            let lover = this.state.players.find(x => x.id === p.state.loverId);
                            if (lover) relationTags += `<div style="color: #e74c3c; font-size: 11px; font-weight: bold; margin-top: 4px;">💞 Yêu: ${lover.name}</div>`;
                        }
                        if (p.state.shadowTarget) {
                            let target = this.state.players.find(x => x.id === p.state.shadowTarget);
                            if (target) relationTags += `<div style="color: #8e44ad; font-size: 11px; font-weight: bold; margin-top: 4px;">👤 Cướp thẻ: ${target.name}</div>`;
                        }
                        if (p.role === 'Kẻ báo thù' && p.state.avengerFaction) {
                            let fText = p.state.avengerFaction === 'WOLF' ? 'Phe Sói' : 'Phe Dân';
                            let fColor = p.state.avengerFaction === 'WOLF' ? '#e74c3c' : '#3498db';
                            relationTags += `<div style="color: ${fColor}; font-size: 11px; font-weight: bold; margin-top: 4px;">⚔️ Đã thề: ${fText}</div>`;
                        }
                        if (p.role === 'Kẻ báo thù' && p.state.avengerMark) {
                            let target = this.state.players.find(x => x.id === p.state.avengerMark);
                            if (target) relationTags += `<div style="color: #c0392b; font-size: 11px; font-weight: bold; margin-top: 4px;">🩸 Nhắm: ${target.name}</div>`;
                        }
                        if (p.state.piperCharmed) {
                            // 🎨 Đã loại bỏ viền đỏ pulse, chuyển về dạng thẻ phẳng thanh lịch như Cupid
                            relationTags += `<div style="color: #9b59b6; font-size: 11px; font-weight: bold; margin-top: 4px;">🪈 Bị thôi miên</div>`;
                        }
                        if (p.state.idolId) {
                            let idol = this.state.players.find(x => x.id === p.state.idolId);
                            if (idol) relationTags += `<div style="color: #16a085; font-size: 11px; font-weight: bold; margin-top: 4px;">👶 Thần tượng: ${idol.name}</div>`;
                        }
                        if (p.state.ravenCursed) {
                            relationTags += `<div style="color: #8e44ad; font-size: 11px; font-weight: bold; margin-top: 4px;">🐦‍⬛ Bị Quạ nguyền (+2 Vote)</div>`;
                        }
                        if (p.state.houseBurned) {
                            relationTags += `<div style="color: #d35400; font-size: 11px; font-weight: bold; margin-top: 4px;">🧨 Nhà bị đốt</div>`;
                        }
                        if (p.state.silencedByMoon) {
                            relationTags += `<div style="color: #2980b9; font-size: 11px; font-weight: bold; margin-top: 4px;">🌙 Bị Nguyệt Nữ khóa</div>`;
                        }
                        if (p.state.pharmaSleep) {
                            relationTags += `<div style="color: #16a085; font-size: 11px; font-weight: bold; margin-top: 4px;">💊 Bị cho ngủ</div>`;
                        }
                        if (p.state.hypnotistCharmed) {
                            relationTags += `<div style="color: #1abc9c; font-size: 11px; font-weight: bold; margin-top: 4px;">😵‍💫 Bị Thầy Thôi Miên bắt chết thay</div>`;
                        }
                        if (p.state.infectedByKnight) {
                            relationTags += `<div style="color: #e67e22; font-size: 11px; font-weight: bold; margin-top: 4px;">🗡️ Đang Nhiễm Độc</div>`;
                        }
                    }

                    // Huyết thống (Hai chị em, Ba anh em)
                    if (['Hai chị em', 'Ba anh em'].includes(p.role)) {
                        let sibs = this.state.players.filter(x => x.role === p.role && x.id !== p.id);
                        let sibNames = sibs.map(s => s.name).join(', ');
                        relationTags += `<div style="color: #2980b9; font-size: 11px; font-weight: bold; margin-top: 4px;">👯‍♀️ Đồng bọn: ${sibNames}</div>`;
                    }

                    // Anh Em Sói
                    if (p.role === 'Anh Em Sói') {
                        let broWolves = this.state.players.filter(x => x.role === 'Anh Em Sói' && x.id !== p.id);
                        let broNames = broWolves.map(b => b.name).join(', ');
                        if (broNames) {
                            relationTags += `<div style="color: #e67e22; font-size: 11px; font-weight: bold; margin-top: 4px;">🐺 Anh em sói: ${broNames}</div>`;
                        }
                    }

                    let actionHtml = '';
                    // 🔥 CẤP QUYỀN THAO TÁC TRÊN CẢ NGƯỜI SỐNG LẪN KẺ CHẾT
                    if (this.state.role === 'gm') {
                        let btnColor = this.state.time === 'night' ? 'var(--primary)' : '#e67e22';
                        let btnIcon = this.state.time === 'night' ? '⚡ Cập nhật trạng thái' : '⚖️ Cập nhật trạng thái';

                        // Nếu là xác chết, đổi màu nút sang xám u ám và đổi tên
                        if (isDead) {
                            btnColor = '#7f8c8d';
                            btnIcon = '💀 Thao Tác Hồn Ma';
                        }

                        let pendingBadge = '';
                        if (!isDead && p.pendingActions && p.pendingActions.length > 0) {
                            pendingBadge = '<div style="display:flex; flex-direction:column; gap:4px; margin-top: 6px;">';
                            p.pendingActions.forEach(act => {
                                pendingBadge += `<div style="font-size: 11px; color: #f1c40f; font-weight: bold; background: rgba(0,0,0,0.5); padding: 3px; border-radius: 4px;">⏳ ${act.text}</div>`;
                            });
                            pendingBadge += '</div>';

                            let hasAttack = p.pendingActions.some(a => ['WOLF_BITE', 'WHITE_WOLF_BITE', 'WITCH_POISON', 'ASSASSIN_KILL', 'MANUAL_KILL'].includes(a.action));
                            if (hasAttack) el.classList.add('pending-death');
                        }

                        actionHtml = `
                ${pendingBadge}
                <div style="margin-top: 10px;">
                    <button class="btn-sm" style="background: ${btnColor}" onclick="app.openGMActionMenu('${p.id}')">${btnIcon}</button>
                </div>
            `;
                    }

                    el.innerHTML = `
                    <h4>${p.name}</h4>
                    <p>${p.role}</p>
                    <div style="font-size: 11px; margin-top: 4px; opacity: 0.7;">${isDead ? '💀 Đã hy sinh' : '🟢 Còn sống'}</div>
                    ${relationTags}
                    ${actionHtml}
                `;
                    grid.appendChild(el);
                });
            },

            async commitNightActions() {
                // 🔥 TRẠM GÁC LOGIC TỐI THƯỢNG: Đếm độc lập theo từng Caster
                let cupidValid = true;
                let piperValid = true;
                
                let groupedCupids = {};
                let groupedPipers = {};
                
                this.state.players.forEach(p => {
                    if (p.pendingActions) {
                        p.pendingActions.forEach(act => {
                            if (act.action === 'CUPID_LINK') {
                                let sid = act.sourceId || 'GM';
                                groupedCupids[sid] = (groupedCupids[sid] || 0) + 1;
                            }
                            if (act.action === 'PIPER_CHARM') {
                                let sid = act.sourceId || 'GM';
                                groupedPipers[sid] = (groupedPipers[sid] || 0) + 1;
                            }
                        });
                    }
                });
                
                Object.values(groupedCupids).forEach(count => {
                    if (count > 0 && count % 2 !== 0) cupidValid = false;
                });
                
                if (!cupidValid) {
                    alert("❌ LỖI LOGIC: Cupid BẮT BUỘC phải ghép đúng theo cặp. Mỗi Cupid phải chọn đủ 2 người (Hoặc hủy chọn hoàn toàn)!");
                    return;
                }

                // 🟢 [UI/UX TỐI THƯỢNG] KHÓA NÚT & HIỂN THỊ TRẠNG THÁI LOADING
                const btn = document.querySelector('#night-panel button');
                const oldText = btn.innerText;
                btn.disabled = true;
                btn.innerText = "⏳ ĐANG CHỐT KẾT QUẢ...";
                btn.style.filter = "brightness(0.7)";

                this.state.isSyncing = true;
                let nightActions = [];

                // VÁ LỖI NHÂN BẢN: Chỉ dùng đúng 1 vòng lặp để gom mã lệnh Đa Nhiệm
                this.state.players.forEach(p => {
                    if (p.pendingActions) {
                        p.pendingActions.forEach(act => nightActions.push({ id: p.id, action: act.action, sourceId: act.sourceId, ts: act.ts || Date.now() }));
                    }
                    delete p.pendingActions;
                });
                
                // Sắp xếp nightActions theo thời gian click (để Cupid ghép đôi đúng thứ tự 1-2, 3-4)
                nightActions.sort((a, b) => a.ts - b.ts);

                try {
                    const res = await callMatrix('syncNightData', { roomCode: this.state.roomCode, nightActions });
                    if (res.status === 'success') {
                        let deathMsg = res.deaths.length > 0 ? `💀 Có ${res.deaths.length} người tử nạn gồm: ${res.deaths.join(', ')}` : `🕊️ Một đêm bình yên, không có ai chết!`;
                        this.showAnnouncement(`🔥 KẾT QUẢ ĐÊM SỐ ${res.nightCount} 🔥`, deathMsg);
                        this.applyTimeTheme('day');
                        this.state.time = 'day';
                        this.renderGMGrid();
                    } else {
                        alert(res.message || "Lỗi đồng bộ đêm.");
                    }
                } catch (err) {
                    alert("Không thể gửi dữ liệu đêm tới server.");
                }

                // 🟢 MỞ KHÓA NÚT SAU KHI HOÀN TẤT
                btn.disabled = false;
                btn.innerText = oldText;
                btn.style.filter = "none";

                this.state.isSyncing = false;
                this.fetchGameState();
            },

            openRoleModal() {
                const playerCount = this.state.players.length;
                if (playerCount === 0) {
                    alert("Phòng chưa có người chơi nào tham gia!");
                    return;
                }
                const savedPool = localStorage.getItem('werewolf_selected_roles');
                if (savedPool) {
                    try {
                        this.state.selectedRolesPool = JSON.parse(savedPool);
                    } catch (e) {
                        this.state.selectedRolesPool = [];
                    }
                } else {
                    this.state.selectedRolesPool = [];
                }
                const container = document.getElementById('role-picker-container');
                container.innerHTML = '';

                // 🔥 DANH SÁCH THẺ BÀI ÁNH XẠ CHÍNH XÁC 100% VỚI MASTER DATA CỦA Bạn GIÁM ĐỐC
                const factions = [
                    {
                        id: 'faction-dan', name: '🌾 PHE DÂN LÀNG', roles: [
                            'Dân làng', 'Tiên tri', 'Bảo vệ', 'Thợ săn', 'Phù Thủy', 'Cupid (Thần tình yêu)',
                            'Cảnh sát trưởng (Trưởng làng)', 'Cô Bé (Ti hí)', 'Thằng ngốc', 'Già làng', 'Người thế thân',
                            'Con quạ', 'Hai chị em', 'Ba anh em', 'Thẩm phán lắp bắp', 'Hiệp sĩ kiếm gỉ',
                            'Hồ ly', 'Thần gấu', 'Diễn viên', 'Hầu gái', 'Bà đồng',
                            'Cảnh sát', 'Dược sĩ', 'Kị sĩ', 'Người gọi hồn'
                        ]
                    },
                    {
                        id: 'faction-soi', name: '🐺 PHE Ma Sói & ĐỒNG MINH', roles: [
                            'Ma Sói', 'Sói con', 'Kẻ bị nguyền', 'Đứa trẻ hoang dã',
                            'Bán sói (Sói lai)', 'Sói trùm', 'Sói quỷ',
                            'Sói lửa', 'Sói Anh', 'Sói Em'
                        ]
                    },
                    {
                        id: 'faction-3rd', name: '🎭 PHE ĐỘC LẬP / THỨ 3', roles: [
                            'Sói trắng', 'Cặp đôi khác phe yêu nhau', 'Ăn Trộm', 'Người thổi sáo', 'Kẻ đốt nhà',
                            'Thiên sứ', 'Thành viên giáo phái', 'Nguyệt Nữ', 'Thầy thôi miên', 'Người múa rối',
                            'Sát thủ', 'Ảnh tử', 'Kẻ báo thù'
                        ]
                    }
                ];

                factions.forEach(faction => {
                    const header = document.createElement('h4');
                    header.className = 'faction-header';
                    header.innerText = faction.name;
                    container.appendChild(header);

                    const grid = document.createElement('div');
                    grid.className = 'role-picker-grid';

                    faction.roles.forEach(roleName => {
                        if (!this.masterRoles[roleName]) return;
                        const r = this.masterRoles[roleName];
                        const safeId = roleName.replace(/\s+/g, '-');

                        const card = document.createElement('div');
                        card.className = 'role-card';
                        card.id = `role-card-${safeId}`;
                        card.innerHTML = `
                <div class="role-card-header" style="align-items: center;">
                    <span style="font-size: 15px; flex: 1;">${r.icon} <b>${roleName}</b></span>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <!-- 🔥 Ô SỐ ĐẾM: Đứng trước theo đúng luồng tư duy -->
                        <span class="count-badge" style="width: 26px; height: 26px; font-size: 14px;" id="badge-${safeId}">0</span>
                        
                        <!-- 🔥 NÚT TRỪ BÀI: Hình vuông tuyệt đối (28x28), Căn giữa Flexbox, Tống sang góc phải -->
                        <button class="btn-danger" style="margin: 0; padding: 0; width: 28px; height: 28px; font-size: 20px; font-weight: bold; border-radius: 6px; display: none; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(231,76,60,0.4);" id="btn-minus-${safeId}" onclick="event.stopPropagation(); app.decreaseRole('${roleName}')">-</button>
                    </div>
                </div>
                <p class="role-card-desc">${r.desc}</p>
            `;
                        // Vẫn giữ tính năng Bấm vào cả thẻ bài để CỘNG thêm cho nhanh!
                        card.onclick = () => this.toggleSelectRole(roleName);
                        grid.appendChild(card);
                    });

                    container.appendChild(grid);
                });

                this.updateRoleCounter();
                document.getElementById('modal-roles').classList.add('active');
            },

            toggleSelectRole(roleName) {
                // 🔥 TIÊN TRI TOÁN HỌC: Nếu thẻ chuẩn bị bốc lên (hoặc thẻ đã có sẵn) là Ăn Trộm/Diễn Viên -> Tự động nới lỏng giới hạn lên +2
                const willHaveThief = this.state.selectedRolesPool.includes('Ăn Trộm') || roleName === 'Ăn Trộm';
                const willHaveActor = this.state.selectedRolesPool.includes('Diễn viên') || roleName === 'Diễn viên';
                
                let spareCount = 0;
                if (willHaveThief) spareCount += 2;
                if (willHaveActor) spareCount += 3;

                const maxAllowed = this.state.players.length + spareCount;

                if (this.state.selectedRolesPool.length >= maxAllowed) {
                    alert(`Tối đa là ${maxAllowed} bài! (Đã tính các quy tắc Bài Nọc). Hãy bấm "CHỌN LẠI TỪ ĐẦU" nếu muốn sửa.`);
                    return;
                }
                this.state.selectedRolesPool.push(roleName);
                this.updateRoleCounter();
            },

            // 🔥 LÕI XẢ ÁP LỰC: RÚT BÀI RA KHỎI POOL
            decreaseRole(roleName) {
                // Tìm vị trí CUỐI CÙNG của lá bài này trong bộ bài và rút nó ra
                const index = this.state.selectedRolesPool.lastIndexOf(roleName);
                if (index > -1) {
                    this.state.selectedRolesPool.splice(index, 1);

                    // 🔥 TRỌNG LỰC CƠ HỌC: Tạo độ nảy vật lý để Quản trò cảm nhận được cú click
                    const safeId = roleName.replace(/\s+/g, '-');
                    const card = document.getElementById(`role-card-${safeId}`);
                    if (card) {
                        card.style.transform = 'scale(0.97)';
                        setTimeout(() => card.style.transform = 'scale(1)', 150);
                    }

                    this.updateRoleCounter(); // Đồng bộ lại toán học
                }
            },

            resetSelectedRoles(btn = null) {
                // 🔥 TRỌNG LỰC CƠ HỌC: Khóa nút lại ngay lập tức
                const lockState = this.lockBtn(btn, "🔄 ĐANG HỦY BÀI...");

                this.state.selectedRolesPool = [];
                this.updateRoleCounter();

                // ⚡ Ép hệ thống giữ nguyên trạng thái lún nút trong 150ms để cảm nhận độ nảy
                setTimeout(() => {
                    this.unlockBtn(btn, lockState);
                }, 150);
            },

            showSelectedRolesSummary() {
                if (this.state.selectedRolesPool.length === 0) {
                    alert("Chưa có lá bài nào được chọn!");
                    return;
                }
                const counts = {};
                this.state.selectedRolesPool.forEach(r => {
                    counts[r] = (counts[r] || 0) + 1;
                });
                let html = '';
                for (const [role, count] of Object.entries(counts)) {
                    const rData = this.masterRoles[role];
                    const icon = rData ? rData.icon : '❓';
                    const desc = rData ? rData.desc : '';
                    html += `<div style="display: flex; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);"><div style="font-size: 24px; margin-right: 15px; min-width: 30px; text-align: center;">${icon}</div><div style="font-weight: bold; font-size: 16px; color: var(--primary);">${role} <span style="color: var(--danger); margin-left: 10px;">x${count}</span></div></div>`;
                }
                const messageHtml = `<div style="max-height: 50vh; overflow-y: auto; padding-right: 5px; text-align: left;">${html}</div>`;
                this.showAnnouncement('📋 DANH SÁCH BÀI ĐÃ CHỌN', messageHtml);
            },

            updateRoleCounter() {
                localStorage.setItem('werewolf_selected_roles', JSON.stringify(this.state.selectedRolesPool));
                const playerCount = this.state.players.length;
                const hasThief = this.state.selectedRolesPool.includes('Ăn Trộm');
                const hasActor = this.state.selectedRolesPool.includes('Diễn viên');
                let spareCount = 0;
                if (hasThief) spareCount += 2;
                if (hasActor) spareCount += 3;

                const requiredCards = playerCount + spareCount;

                // Cảnh báo đỏ rực nếu có Bài Nọc
                const extraText = spareCount > 0 ? ` <span style="font-size:14px; color:#f39c12;">(+${spareCount} Bài Nọc)</span>` : "";
                document.getElementById('modal-role-counter').innerHTML = `Đã chọn: ${this.state.selectedRolesPool.length} / ${requiredCards} bài ${extraText}`;

                Object.keys(this.masterRoles).forEach(r => {
                    const cnt = this.state.selectedRolesPool.filter(x => x === r).length;
                    const safeId = r.replace(/\s+/g, '-');
                    const badge = document.getElementById(`badge-${safeId}`);
                    const card = document.getElementById(`role-card-${safeId}`);
                    const minusBtn = document.getElementById(`btn-minus-${safeId}`);

                    if (badge && card) {
                        badge.innerText = cnt;
                        if (cnt > 0) {
                            card.classList.add('selected');
                            if (minusBtn) minusBtn.style.display = 'flex'; // 🔥 Phải dùng 'flex' để giữ cấu trúc căn giữa tuyệt đối
                        } else {
                            card.classList.remove('selected');
                            if (minusBtn) minusBtn.style.display = 'none';
                        }
                    }
                });
            },

            closeRoleModal(btn = null) {
                // 🔥 TRỌNG LỰC CƠ HỌC CHO NÚT ĐÓNG
                const lockState = this.lockBtn(btn, "❌ ĐANG ĐÓNG...");

                setTimeout(() => {
                    this.unlockBtn(btn, lockState);
                    document.getElementById('modal-roles').classList.remove('active');
                }, 100); // Rút ngắn còn 100ms cho nút Đóng để cảm giác dứt khoát hơn
            },

            async confirmDistributeCards(btn = null) {
                const playerCount = this.state.players.length;
                const hasThief = this.state.selectedRolesPool.includes('Ăn Trộm');
                const hasActor = this.state.selectedRolesPool.includes('Diễn viên');
                let spareCount = 0;
                if (hasThief) spareCount += 2;
                if (hasActor) spareCount += 3;

                const requiredCards = playerCount + spareCount;

                if (this.state.selectedRolesPool.length !== requiredCards) {
                    alert(`Sự chênh lệch Vật lý! Bạn đã chọn ${this.state.selectedRolesPool.length} lá, nhưng hệ thống yêu cầu đúng ${requiredCards} lá!`);
                    return;
                }

                if (spareCount > 0) {
                    const spareCards = this.state.selectedRolesPool.slice(playerCount);
                    const confirmMsg = `Bài Nọc gồm ${spareCount} lá:\n- ${spareCards.join('\n- ')}\n\nLưu ý: Chỉ xáo và chia ${playerCount} lá đầu tiên cho người chơi. Bạn có chắc chắn muốn phát bài?`;
                    if (!(await this.confirmAction(confirmMsg))) return;
                }

                // 🚨 KHÓA VAN AN TOÀN TRUYỆT ĐỐI! 
                // Bóp nghẹt pollLoop, cấm nó cập nhật lung tung trong lúc đang phát bài
                this.state.isSyncing = true;

                const lockState = this.lockBtn(btn, "⏳ ĐANG XÁO & PHÁT BÀI...");
                try {
                    const res = await callMatrix('distributeCards', { roomCode: this.state.roomCode, selectedRoles: this.state.selectedRolesPool });
                    if (res.status === 'success') {
                        alert("Đã xáo trộn và phát bài thành công!");
                        this.closeRoleModal();
                    } else {
                        alert(res.message || "Phát bài thất bại.");
                    }
                } catch (e) {
                    console.error("Lỗi khi phát bài:", e);
                    alert("Có lỗi xảy ra khi phát bài.");
                } finally {
                    this.state.isSyncing = false;
                    if(btn) this.unlockBtn(btn, lockState);
                }
            },

            openGMActionMenu(targetId) {
                const target = this.state.players.find(x => x.id === targetId);
                if (!target) return;
                const night = this.state.gameFlags?.nightCount || 1;
                const hasWolf = this.state.players.some(p => p.status !== 'Dead' && p.role.toLowerCase().includes('sói') && p.role !== 'Kẻ bị nguyền' && p.role !== 'Bán sói (Sói lai)');
                const livingRoles = this.state.players.filter(p => p.status !== 'Dead').map(p => p.role);
                const gameFlags = this.state.gameFlags || {};

                const modal = document.getElementById('modal-gm-action');
                const pName = document.getElementById('gm-action-target-name');
                const pRole = document.getElementById('gm-action-target-role');
                const actionList = document.getElementById('gm-action-list');

                pName.innerText = `Mục tiêu: ${target.name}`;
                pRole.innerText = `Vai trò thực tế: ${target.role} | Trạng thái: ${target.status}`;
                
                actionList.style.maxHeight = '55vh';
                actionList.style.overflowY = 'auto';
                actionList.style.paddingRight = '5px';
                actionList.innerHTML = '<style>#gm-action-list > * { flex-shrink: 0 !important; }</style>';

                const allRolesInGame = this.state.players.map(p => p.role);
                if (this.state.time === 'night') {
                    if (gameFlags.isManualMode) {
                        let manualHtml = `
                            <div style="font-size: 12px; color: #f39c12; font-weight: bold; margin-bottom: 10px;">⚙️ CHẾ ĐỘ THỦ CÔNG</div>
                            <button class="btn-danger" onclick="app.setPendingAction('${targetId}', 'MANUAL_KILL', '🔪 Đánh Dấu CHẾT')">🔪 Đánh dấu CHẾT</button>
                            <button class="btn-success" onclick="app.setPendingAction('${targetId}', 'MANUAL_SAVE', '🛡️ Đánh Dấu CỨU')">🛡️ Đánh dấu CỨU</button>
                        `;
                        
                        // Thay đổi bài đêm
                        manualHtml += `
                            <div style="margin-top: 15px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                                <p style="font-size: 12px; margin: 0 0 5px 0; color: #f1c40f;">🛠️ Thay đổi lá bài/vai trò (Tác dụng ngay):</p>
                                <select id="gm-new-role-${targetId}" style="width:100%; padding: 8px; margin-bottom: 8px; border-radius: 6px; font-size:14px; color: black;">
                                    ${Object.keys(this.masterRoles).map(r => `<option value="${r}" ${r === target.role ? 'selected' : ''}>${r}</option>`).join('')}
                                </select>
                                <button class="btn-primary" style="padding: 8px; font-size: 14px;" onclick="app.gmChangeRole('${targetId}', this)">💾 Cập Nhật</button>
                            </div>
                        `;

                        // Dấu ấn nhân vật
                        manualHtml += `<div style="font-size: 12px; color: #95a5a6; font-weight: bold; margin-top: 15px; margin-bottom: 5px;">DẤU ẤN NHÂN VẬT</div>`;
                        
                        let allCasters = [...this.state.players];
                        allCasters.sort((a, b) => { if (a.role && b.role) return a.role.localeCompare(b.role); return 0; });
                        
                        allCasters.forEach(c => {
                            if (c.role === 'Cupid (Thần tình yêu)') manualHtml += `<button style="background: #e74c3c" onclick="app.setPendingAction('${targetId}', 'CUPID_LINK', '💘 Cupid Ghép Đôi', '${c.id}')">💘 Ghép đôi (Cupid ${c.name})</button>`;
                            if (c.role === 'Thầy thôi miên') manualHtml += `<button style="background: #2980b9" onclick="app.setPendingAction('${targetId}', 'HYPNOTIST_CHARM', '😵‍💫 Bị Thôi Miên', '${c.id}')">😵‍💫 Thôi miên (Thầy Thôi Miên ${c.name})</button>`;
                            if (c.role === 'Ảnh tử') manualHtml += `<button style="background: #34495e" onclick="app.setPendingAction('${targetId}', 'SHADOW_MARK', '👤 Bị Cướp Bài', '${c.id}')">👤 Cướp bài (Ảnh tử ${c.name})</button>`;
                            if (c.role === 'Đứa trẻ hoang dã') manualHtml += `<button style="background: #16a085" onclick="app.setPendingAction('${targetId}', 'WILD_CHILD_IDOL', '👶 Làm Thần Tượng', '${c.id}')">👶 Thần tượng (Trẻ hoang dã ${c.name})</button>`;
                            if (c.role === 'Nguyệt Nữ') manualHtml += `<button style="background: #8e44ad" onclick="app.setPendingAction('${targetId}', 'MOON_SILENCE', '🌙 Bị Câm Lặng', '${c.id}')">🌙 Câm lặng (Nguyệt Nữ ${c.name})</button>`;
                            if (c.role === 'Dược sĩ') {
                                if (!(c.state || {}).usedPharmaSleep) manualHtml += `<button style="background: #d35400" onclick="app.setPendingAction('${targetId}', 'PHARMA_SLEEP', '💊 Đánh Thuốc Mê', '${c.id}')">💊 Thuốc mê (Dược sĩ ${c.name})</button>`;
                                else manualHtml += `<button disabled style="background: #555;">💊 Dược Sĩ ${c.name}: Đã hết bình mê hồn</button>`;
                            }
                            if (c.role === 'Con quạ') manualHtml += `<button style="background: #2c3e50" onclick="app.setPendingAction('${targetId}', 'RAVEN_CURSE', '🐦‍⬛ Bị Nguyền Rủa', '${c.id}')">🐦‍⬛ Nguyền rủa (Con Quạ ${c.name})</button>`;
                            if (c.role === 'Kẻ báo thù') manualHtml += `<button style="background: #c0392b" onclick="app.setPendingAction('${targetId}', 'AVENGER_MARK', '🩸 Trả Thù', '${c.id}')">🩸 Trả thù (Kẻ Báo Thù ${c.name})</button>`;
                            if (c.role === 'Thợ săn') manualHtml += `<button style="background: #e67e22" onclick="app.setPendingAction('${targetId}', 'HUNTER_MARK', '🏹 Thợ Săn Ngắm', '${c.id}')">🏹 Ngắm bắn (Thợ săn ${c.name})</button>`;
                            if (c.role === 'Kẻ đốt nhà') manualHtml += `<button style="background: #d35400" onclick="app.setPendingAction('${targetId}', 'PYRO_BURN', '🧨 Đốt Nhà', '${c.id}')">🧨 Đốt nhà (Kẻ đốt nhà ${c.name})</button>`;
                            if (c.role === 'Người thổi sáo') manualHtml += `<button style="background: #2c3e50" onclick="app.setPendingAction('${targetId}', 'PIPER_CHARM', '🪈 Bị Thổi Sáo', '${c.id}')">🪈 Thôi miên (Thổi sáo ${c.name})</button>`;
                            if (c.role === 'Người múa rối') manualHtml += `<button style="background: #c0392b" onclick="app.setPendingAction('${targetId}', 'PUPPETEER_CONTROL', '🎎 Múa Rối', '${c.id}')">🎎 Ép Sói cắn (Múa rối ${c.name})</button>`;
                            if (c.role === 'Hiệp sĩ kiếm gỉ') {
                                if (!(c.state || {}).usedRustyKnightInfect) manualHtml += `<button style="background: #8e44ad" onclick="app.setPendingAction('${targetId}', 'GM_INFECT_RUSTY', '🗡️ Nhiễm độc', '${c.id}')">🗡️ Nhiễm độc (Kiếm Gỉ ${c.name})</button>`;
                                else manualHtml += `<button disabled style="background: #555;">🗡️ Kiếm Gỉ ${c.name}: Đã nhiễm độc</button>`;
                            }
                        });

                        actionList.innerHTML += manualHtml;
                        actionList.innerHTML += `<div style="margin-top: 15px;"><button class="btn-secondary" onclick="app.clearPendingAction('${targetId}')">🔄 Hủy bỏ mọi thao tác trên người này</button></div>`;
                    } else {
                        let atkHtml = '';
                        let defHtml = '';
                        let spcHtml = '';
                        
                        if (hasWolf) {
                            atkHtml += `<button class="btn-danger" onclick="app.setPendingAction('${targetId}', 'WOLF_BITE', '🐺 Bị Sói Cắn')">🐺 Bầy Sói: Cắn giết</button>`;
                        }

                        let activeCasters = this.state.players.filter(p => p.status !== 'Dead');
                        activeCasters.sort((a, b) => { if (a.role && b.role) return a.role.localeCompare(b.role); return 0; });
                        activeCasters.forEach(c => {
                            const cState = c.state || {};
                            
                            // --- TẤN CÔNG ---
                            if (c.role === 'Sói trắng') {
                                if (!cState.lastWhiteWolfNight || (night - cState.lastWhiteWolfNight >= 2)) atkHtml += `<button class="btn-danger" onclick="app.setPendingAction('${targetId}', 'WHITE_WOLF_BITE', '🐺 Sói Trắng Cắn', '${c.id}')">🐺 Sói Trắng ${c.name}: Giết Sói</button>`;
                                else atkHtml += `<button disabled style="background: #555;">🐺 Sói Trắng ${c.name}: Đang hồi sức</button>`;
                            }
                            if (c.role === 'Sói trùm') {
                                let anyWolfDied = this.state.players.some(p => p.status === 'Dead' && p.role.toLowerCase().includes('sói') && p.role !== 'Kẻ bị nguyền' && p.role !== 'Bán sói (Sói lai)');
                                if (!anyWolfDied) atkHtml += `<button style="background: #c0392b" onclick="app.setPendingAction('${targetId}', 'BIG_BAD_WOLF_BITE', '👹 Sói Trùm Cắn', '${c.id}')">👹 Sói Trùm ${c.name}: Cắn thêm</button>`;
                                else atkHtml += `<button disabled style="background: #555;">👹 Sói Trùm ${c.name}: Đồng minh đã chết</button>`;
                            }
                            if (c.role === 'Sói quỷ') {
                                if (!cState.usedWolfFather) atkHtml += `<button style="background: #8e44ad" onclick="app.setPendingAction('${targetId}', 'WOLF_FATHER_CONVERT', '👑 Sói Quỷ Cảm Hóa', '${c.id}')">👑 Sói quỷ ${c.name}: Cảm hóa</button>`;
                                else atkHtml += `<button disabled style="background: #555;">👑 Sói quỷ ${c.name}: Đã dùng</button>`;
                            }
                            if (c.role === 'Phù Thủy') {
                                if (!cState.usedWitchPoison) atkHtml += `<button style="background: #8e44ad" onclick="app.setPendingAction('${targetId}', 'WITCH_POISON', '🧪 Phù Thủy Độc', '${c.id}')">🧪 Phù Thủy ${c.name}: Đầu độc</button>`;
                                else atkHtml += `<button disabled style="background: #555;">🧪 Phù Thủy ${c.name}: Hết độc</button>`;
                            }
                            if (c.role === 'Sát thủ') {
                                if (!cState.lastAssassinNight || (night - cState.lastAssassinNight >= 2)) atkHtml += `<button style="background: #c0392b" onclick="app.setPendingAction('${targetId}', 'ASSASSIN_KILL', '🥷 Sát Thủ Giết', '${c.id}')">🥷 Sát thủ ${c.name}: Ám sát</button>`;
                                else atkHtml += `<button disabled style="background: #555;">🥷 Sát thủ ${c.name}: Đang mài dao</button>`;
                            }
                            if (c.role === 'Hiệp sĩ kiếm gỉ') {
                                if (!cState.usedRustyKnightInfect) atkHtml += `<button style="background: #8e44ad" onclick="app.setPendingAction('${targetId}', 'GM_INFECT_RUSTY', '🗡️ Nhiễm độc', '${c.id}')">🗡️ Kỵ Sĩ ${c.name}: Nhiễm độc</button>`;
                                else atkHtml += `<button disabled style="background: #555;">🗡️ Hiệp Sĩ ${c.name}: Đã độc</button>`;
                            }

                            if (c.role === 'Sói Em') {
                                if (cState.isAwakened && !cState.usedBrotherRevenge) atkHtml += '<button style="background: #c0392b" onclick="app.setPendingAction(\'' + targetId + '\', \'WOLF_BROTHER_REVENGE\', \'🐾 Sói Em Trả Thù\', \'' + c.id + '\')">🐾 Sói Em ' + c.name + ': Cắn trả thù</button>';
                                else if (cState.isAwakened && cState.usedBrotherRevenge) atkHtml += '<button disabled style="background: #555;">🐾 Sói Em ' + c.name + ': Đã trả thù</button>';
                            }

                            // --- BẢO VỆ ---
                            if (c.role === 'Phù Thủy') {
                                let isWitchHealedByPharmaNow = this.state.players.some(p => p.role === 'Phù Thủy' && p.pendingActions && p.pendingActions.find(a => a.action === 'PHARMA_HEAL'));
                                if (!cState.usedWitchHeal || isWitchHealedByPharmaNow) defHtml += `<button class="btn-success" onclick="app.setPendingAction('${targetId}', 'WITCH_HEAL', '🧪 Phù Thủy Cứu', '${c.id}')">🧪 Phù Thủy ${c.name}: Cứu</button>`;
                                else defHtml += `<button disabled style="background: #555;">🧪 Phù Thủy ${c.name}: Hết cứu</button>`;
                            }
                            if (c.role === 'Dược sĩ') {
                                if (!cState.usedPharmaHeal) defHtml += `<button class="btn-success" onclick="app.setPendingAction('${targetId}', 'PHARMA_HEAL', '💊 Dược Sĩ Cứu', '${c.id}')">💊 Dược Sĩ ${c.name}: Cứu</button>`;
                                else defHtml += `<button disabled style="background: #555;">💊 Dược Sĩ ${c.name}: Hết hồi phục</button>`;
                            }
                            if (c.role === 'Bảo vệ') {
                                if (cState.lastGuardedId === targetId) defHtml += `<button disabled style="background: #555;">🛡️ Bảo Vệ ${c.name}: Vừa cứu đêm qua</button>`;
                                else defHtml += `<button style="background: #27ae60" onclick="app.setPendingAction('${targetId}', 'GUARD_PROTECT', '🛡️ Bảo Vệ Cứu', '${c.id}')">🛡️ Bảo Vệ ${c.name}: Che chở</button>`;
                            }

                            // --- ĐẶC BIỆT ---
                            if (night === 1) {
                                if (c.role === 'Cupid (Thần tình yêu)') {
                                    if (!cState.usedCupid) spcHtml += `<button style="background: #e74c3c" onclick="app.setPendingAction('${targetId}', 'CUPID_LINK', '💘 Cupid Ghép Đôi', '${c.id}')">💘 Cupid ${c.name}: Ghép đôi</button>`;
                                }
                                if (c.role === 'Ảnh tử') {
                                    if (!cState.usedShadow) spcHtml += `<button style="background: #34495e" onclick="app.setPendingAction('${targetId}', 'SHADOW_MARK', '👤 Ảnh Tử Nhắm', '${c.id}')">👤 Ảnh Tử ${c.name}: Cướp bài</button>`;
                                }
                                if (c.role === 'Đứa trẻ hoang dã') {
                                    if (!cState.usedWildChild) spcHtml += `<button style="background: #16a085" onclick="app.setPendingAction('${targetId}', 'WILD_CHILD_IDOL', '👶 Trẻ Hoang Dã Chọn', '${c.id}')">👶 Trẻ Hoang Dã ${c.name}: Chọn Thần tượng</button>`;
                                }
                                if (c.role === 'Kẻ báo thù') {
                                    spcHtml += `<button style="background: #c0392b" onclick="app.setPendingAction('${targetId}', 'AVENGER_MARK', '🩸 Kẻ Báo Thù Nhắm', '${c.id}')">🩸 Kẻ Báo Thù ${c.name}: Chọn Mục tiêu</button>`;
                                }
                            }
                            if (c.role === 'Kẻ đốt nhà') {
                                if (!cState.usedPyro) spcHtml += `<button style="background: #d35400" onclick="app.setPendingAction('${targetId}', 'PYRO_BURN', '🧨 Bị Đốt Nhà', '${c.id}')">🧨 Đốt Nhà ${c.name}: Đốt</button>`;
                                else spcHtml += `<button disabled style="background: #555;">🧨 Đốt Nhà ${c.name}: Hết bom</button>`;
                            }
                            if (c.role === 'Người múa rối') {
                                if (!cState.usedPuppeteer) spcHtml += `<button style="background: #c0392b" onclick="app.setPendingAction('${targetId}', 'PUPPETEER_CONTROL', '🎎 Múa Rối Điều Khiển', '${c.id}')">🎎 Múa Rối ${c.name}: Ép Sói Cắn</button>`;
                                else spcHtml += `<button disabled style="background: #555;">🎎 Múa Rối ${c.name}: Đứt dây</button>`;
                            }
                            if (c.role === 'Dược sĩ') {
                                if (!cState.usedPharmaSleep) spcHtml += `<button style="background: #d35400" onclick="app.setPendingAction('${targetId}', 'PHARMA_SLEEP', '💊 Đánh Thuốc Mê', '${c.id}')">💊 Dược Sĩ ${c.name}: Thuốc mê</button>`;
                                else spcHtml += `<button disabled style="background: #555;">💊 Dược Sĩ ${c.name}: Hết mê hồn</button>`;
                            }
                            if (c.role === 'Thợ săn') spcHtml += `<button style="background: #d35400" onclick="app.setPendingAction('${targetId}', 'HUNTER_MARK', '🏹 Đích ngắm Thợ Săn', '${c.id}')">🏹 Thợ Săn ${c.name}: Chọn Chết Theo</button>`;
                            if (c.role === 'Nguyệt Nữ') spcHtml += `<button style="background: #2980b9" onclick="app.setPendingAction('${targetId}', 'MOON_SILENCE', '🌙 Nguyệt Nữ Khóa', '${c.id}')">🌙 Nguyệt Nữ ${c.name}: Khóa kỹ năng</button>`;
                            if (c.role === 'Con quạ') {
                                if (cState.lastRavenCurseId === targetId) {
                                    spcHtml += `<button class="btn-disabled" disabled>🐦‍⬛ Con Quạ ${c.name}: Đã nguyền đêm qua</button>`;
                                } else {
                                    spcHtml += `<button style="background: #8e44ad" onclick="app.setPendingAction('${targetId}', 'RAVEN_CURSE', '🐦‍⬛ Con Quạ: Nguyền (2 Vote)', '${c.id}')">🐦‍⬛ Con Quạ ${c.name}: Nguyền</button>`;
                                }
                            }
                            if (c.role === 'Người thổi sáo') {
                                const targetState = target.state || {};
                                if (targetState.piperCharmed) spcHtml += `<button disabled style="background: #555;">🪈 Thổi Sáo ${c.name}: Đã bị thôi miên</button>`;
                                else spcHtml += `<button style="background: #2c3e50" onclick="app.setPendingAction('${targetId}', 'PIPER_CHARM', '🪈 Bị Thôi Miên', '${c.id}')">🪈 Thổi Sáo ${c.name}: Thôi miên</button>`;
                            }
                            if (c.role === 'Thầy thôi miên') {
                                if (cState.lastHypnotizedId === targetId) spcHtml += `<button disabled style="background: #555;">😵‍💫 Thầy Thôi Miên ${c.name}: Vừa chọn đêm qua</button>`;
                                else spcHtml += `<button style="background: #1abc9c" onclick="app.setPendingAction('${targetId}', 'HYPNOTIST_CHARM', '😵‍💫 Thầy Thôi Miên', '${c.id}')">😵‍💫 Thầy Thôi Miên ${c.name}: Bắt Chết Thay</button>`;
                            }
                        });

                        if (night > 1) {
                            if (livingRoles.includes('Cupid (Thần tình yêu)')) spcHtml += `<button disabled style="background: #555;">💘 Cupid: Chỉ tác dụng Đêm 1</button>`;
                            if (livingRoles.includes('Ảnh tử')) spcHtml += `<button disabled style="background: #555;">👤 Ảnh Tử: Đã qua Đêm 1</button>`;
                            if (livingRoles.includes('Đứa trẻ hoang dã')) spcHtml += `<button disabled style="background: #555;">👶 Trẻ Hoang Dã: Đã qua Đêm 1</button>`;
                        }

                        if (atkHtml) actionList.innerHTML += `<div style="font-size: 12px; color: var(--danger); font-weight: bold; margin-top: 10px;">⚔️ NHÓM TẤN CÔNG</div>` + atkHtml;
                        if (defHtml) actionList.innerHTML += `<div style="font-size: 12px; color: var(--success); font-weight: bold; margin-top: 10px;">🛡️ NHÓM BẢO VỆ</div>` + defHtml;
                        if (spcHtml) actionList.innerHTML += `<div style="font-size: 12px; color: #f39c12; font-weight: bold; margin-top: 10px;">🔮 KỸ NĂNG & ĐÁNH DẤU</div>` + spcHtml;

                        actionList.innerHTML += `<div style="margin-top: 15px;"><button class="btn-secondary" onclick="app.clearPendingAction('${targetId}')">🔄 Hủy bỏ mọi thao tác trên người này</button></div>`;
                    }
                } else {
                    // ☀️ BAN NGÀY: TOÀN QUYỀN ĐIỀU HÀNH CHO QUẢN TRÒ
                    actionList.innerHTML += `<button class="btn-secondary" style="background:#e67e22" onclick="app.startVote('${targetId}', this)">⚖️ Đưa lên giàn Treo Cổ</button>`;

                    if (target.status === 'Dead') {
                        // Nút Hồi sinh cho người đã chết
                        actionList.innerHTML += `<button class="btn-success" style="background:#27ae60" onclick="app.gmRevivePlayer('${targetId}', this)">✨ Hồi Sinh Người Chơi</button>`;
                    } else {
                        // Nút Giết trực tiếp
                        actionList.innerHTML += `<button class="btn-danger" style="background:#c0392b" onclick="app.gmKillPlayer('${targetId}', this)">⚔️ Giết Trực Tiếp (Phán Quyết)</button>`;

                        // Nút Thay đổi vai trò (Đổi bài)
                        actionList.innerHTML += `
                <div style="margin-top: 10px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                    <p style="font-size: 12px; margin: 0 0 5px 0; color: #f1c40f;">🛠️ Thay đổi lá bài/vai trò:</p>
                    <select id="gm-new-role-${targetId}" style="width:100%; padding: 8px; margin-bottom: 8px; border-radius: 6px; font-size:14px;">
                        ${Object.keys(this.masterRoles).map(r => `<option value="${r}" ${r === target.role ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                    <button class="btn-primary" style="padding: 8px; font-size: 14px;" onclick="app.gmChangeRole('${targetId}', this)">💾 Cập Nhật Vai Trò</button>
                </div>
            `;
                    }
                }

                // 🔥 NÚT BẤM CỦA BẠO CHÚA (XUẤT HIỆN CẢ NGÀY LẪN ĐÊM)
                actionList.innerHTML += `
            <div style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                <button class="btn-primary" style="background: #34495e; box-shadow: 0 4px 15px rgba(52, 73, 94, 0.6); margin-bottom: 10px;" onclick="app.transferGMRole('${targetId}', this)">👑 Nhường quyền Quản Trò</button>
                <button class="btn-danger" style="background: #7f0000; box-shadow: 0 4px 15px rgba(127,0,0,0.6);" onclick="app.kickPlayer('${targetId}', this)">🚷 ĐUỔI KHỎI PHÒNG (KICK)</button>
            </div>
        `;

                document.getElementById('modal-gm-action').classList.add('active');
                document.body.style.overflow = 'hidden';
            },

            closeGMActionMenu() {
                document.getElementById('modal-gm-action').classList.remove('active');
                document.body.style.overflow = '';
            },

            setPendingAction(targetId, actionCode, actionText, sourceId = null) {
                // ĐIỀU HƯỚNG CUPID KIỂM TRA ĐA NHIỆM (Đếm theo Caster)
                if (actionCode === 'CUPID_LINK') {
                    let sourceCupids = 0;
                    this.state.players.forEach(pl => {
                        if (pl.pendingActions && pl.pendingActions.find(a => a.action === 'CUPID_LINK' && a.sourceId === sourceId)) sourceCupids++;
                    });
                    if (sourceCupids >= 2) {
                        alert(`❌ LỖI: Cupid này đã chọn đủ 2 người! Hãy hủy thao tác cũ trước khi chọn lại.`);
                        return;
                    }
                }

                // 🔥 ĐIỀU HƯỚNG THÔI MIÊN: NGĂN CHẶN CHỌN QUÁ GIỚI HẠN (Đếm theo Caster)
                if (actionCode === 'PIPER_CHARM') {
                    let sourcePipers = 0;
                    this.state.players.forEach(pl => {
                        if (pl.pendingActions && pl.pendingActions.find(a => a.action === 'PIPER_CHARM' && a.sourceId === sourceId)) sourcePipers++;
                    });
                    if (sourcePipers >= 2) {
                        alert(`❌ LỖI LOGIC: Người thổi sáo này đã chọn đủ 2 người mỗi đêm! Hãy hủy thao tác cũ trước.`);
                        return;
                    }
                }

                // Hủy target cũ nếu là kỹ năng đơn mục tiêu
                const multiTargetSkills = ['CUPID_LINK', 'PIPER_CHARM', 'WOLF_BITE', 'MANUAL_KILL', 'MANUAL_SAVE'];
                if (sourceId && !multiTargetSkills.includes(actionCode)) {
                    this.state.players.forEach(pl => {
                        if (pl.pendingActions) {
                            pl.pendingActions = pl.pendingActions.filter(a => !(a.action === actionCode && a.sourceId === sourceId));
                        }
                    });
                }

                const p = this.state.players.find(x => x.id === targetId);
                if (p) {
                    if (!p.pendingActions) p.pendingActions = [];
                    // Chống bấm đúp trùng 1 lệnh
                    if (!p.pendingActions.find(a => a.action === actionCode && a.sourceId === sourceId)) {
                        p.pendingActions.push({ action: actionCode, text: actionText, sourceId: sourceId, ts: Date.now() });
                    }
                }
                this.closeGMActionMenu();
                this.renderGMGrid();
            },

            async gmKillPlayer(targetId, btn = null) {
                if (!(await this.confirmAction("Bạn có chắc muốn trực tiếp tước đoạt sinh mệnh người chơi này mà không cần qua giàn treo cổ?"))) return;
                const lockState = this.lockBtn(btn, "⏳ ĐANG TIÊU DIỆT...");
                try {
                    const res = await callMatrix('gmKillPlayer', { roomCode: this.state.roomCode, targetId: targetId });
                    alert(res.message);
                    this.closeGMActionMenu();
                } catch (e) { alert("Lỗi kết nối khi phán quyết!"); }
                this.unlockBtn(btn, lockState);
                this.fetchGameState();
            },

            async gmRevivePlayer(targetId, btn = null) {
                if (!(await this.confirmAction("Bạn có chắc muốn hồi sinh người chơi này trở lại cõi sống?"))) return;
                const lockState = this.lockBtn(btn, "⏳ ĐANG HỒI SINH...");
                try {
                    const res = await callMatrix('gmRevivePlayer', { roomCode: this.state.roomCode, targetId: targetId });
                    alert(res.message);
                    this.closeGMActionMenu();
                } catch (e) { alert("Lỗi kết nối khi hồi sinh!"); }
                this.unlockBtn(btn, lockState);
                this.fetchGameState();
            },

            async gmChangeRole(targetId, btn = null) {
                const selectEl = document.getElementById(`gm-new-role-${targetId}`);
                if (!selectEl) return;
                const newRole = selectEl.value;

                if (!(await this.confirmAction(`Bạn có chắc muốn đổi vai trò của người chơi này thành [${newRole}]?`))) return;
                const lockState = this.lockBtn(btn, "⏳ ĐANG CẬP NHẬT...");
                try {
                    const res = await callMatrix('gmChangeRole', { roomCode: this.state.roomCode, targetId: targetId, newRole: newRole });
                    alert(res.message);
                    this.closeGMActionMenu();
                } catch (e) { alert("Lỗi kết nối khi đổi vai trò!"); }
                this.unlockBtn(btn, lockState);
                this.fetchGameState();
            },

            clearPendingAction(targetId) {
                const p = this.state.players.find(x => x.id === targetId);
                if (p) delete p.pendingActions;
                this.closeGMActionMenu();
                this.renderGMGrid();
            },

            async endGame() {
                if (await this.confirmAction("Bạn có chắc chắn muốn đóng phòng này? Dữ liệu phòng sẽ bị xóa vĩnh viễn.")) {

                    // 🟢 [UI/UX TỐI THƯỢNG] BÁO HIỆU ĐANG ĐÁNH SẬP
                    const btn = document.querySelector('button[onclick="app.endGame()"]');
                    const oldText = btn.innerText;
                    if (btn) {
                        btn.disabled = true;
                        btn.innerText = "⏳ ĐANG ĐÁNH SẬP PHÒNG...";
                    }

                    try {
                        const res = await callMatrix('endRoom', { roomCode: this.state.roomCode });
                        alert(res.message || "Đã đóng phòng.");
                        this.leaveRoom();
                    } catch (err) {
                        alert("Lỗi khi đóng phòng.");
                    }

                    // (Thực tế nếu đóng phòng thành công sẽ bị văng ra sảnh, nhưng cứ mở khóa an toàn)
                    if (btn) {
                        btn.disabled = false;
                        btn.innerText = oldText;
                    }
                }
            },

            // ==========================================
            // 🔥 HỆ THỐNG MENU NỔI (FLOATING MENU)
            // ==========================================
            toggleFloatingMenu() {
                const menu = document.getElementById('floating-menu-options');
                if (menu) {
                    menu.classList.toggle('active');
                }
            },

            // ==========================================
            // 🔥 HỆ THỐNG TRA CỨU TỪ ĐIỂN NHÂN VẬT (CODEX)
            // ==========================================
            openCodexModal() {
                this.renderCodexList(this.masterRoles);
                document.getElementById('codex-search').value = '';
                document.getElementById('modal-codex').classList.add('active');
            },

            closeCodexModal() {
                document.getElementById('modal-codex').classList.remove('active');
            },

            renderCodexList(rolesObj) {
                const listEl = document.getElementById('codex-list');
                listEl.innerHTML = '';

                Object.keys(rolesObj).forEach(roleName => {
                    const r = rolesObj[roleName];
                    const item = document.createElement('div');
                    item.className = 'codex-item';
                    item.innerHTML = `
                    <div class="codex-icon">${r.icon}</div>
                    <div class="codex-info">
                        <h4>${roleName}</h4>
                        <p>${r.desc}</p>
                    </div>
                `;
                    listEl.appendChild(item);
                });
            },

            filterCodex(keyword) {
                const query = keyword.toLowerCase().trim();
                if (!query) {
                    this.renderCodexList(this.masterRoles);
                    return;
                }

                let filtered = {};
                Object.keys(this.masterRoles).forEach(roleName => {
                    const r = this.masterRoles[roleName];
                    if (roleName.toLowerCase().includes(query) || r.desc.toLowerCase().includes(query)) {
                        filtered[roleName] = r;
                    }
                });
                this.renderCodexList(filtered);
            },

            // ================= QUYỀN PHÁN QUYẾT CHIẾN THẮNG =================
            openWinDeclareModal() {
                if (this.state.role !== 'gm') return;
                document.getElementById('modal-win-declare').classList.add('active');
            },
            closeWinDeclareModal() {
                document.getElementById('modal-win-declare').classList.remove('active');
            },
            async declareWinner(winner) {
                if (!(await this.confirmAction("Bạn có chắc chắn muốn kết thúc game và tuyên bố chiến thắng? Thao tác này sẽ hiển thị lên máy tất cả người chơi."))) return;
                this.closeWinDeclareModal();
                let flags = this.state.gameFlags || {};
                flags.winner = winner;
                try {
                    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                    await client.from('rooms').update({ game_flags: flags }).eq('room_code', this.state.roomCode);
                    window.alert("Đã kết thúc game thành công!");
                } catch (e) {
                    console.error("Lỗi khi kết thúc game:", e);
                    window.alert("Có lỗi xảy ra khi kết thúc game.");
                }
            },

            // ================= SỔ TAY GHI CHÚ QUẢN TRÒ =================
            openNoteModal() {
                if (this.state.role !== 'gm') return;
                const noteInput = document.getElementById('note-textarea');
                // Nạp từ localStorage
                const saved = localStorage.getItem('gmNotes_' + this.state.roomCode);
                if (saved) noteInput.value = saved;
                else noteInput.value = '';
                document.getElementById('modal-note').classList.add('active');
            },

            closeNoteModal() {
                document.getElementById('modal-note').classList.remove('active');
            },

            async clearNote() {
                if (await this.confirmAction('Bạn có chắc chắn muốn xóa toàn bộ ghi chú của phòng này?')) {
                    localStorage.removeItem('gmNotes_' + this.state.roomCode);
                    document.getElementById('note-textarea').value = '';
                    this.showToast('Đã xóa ghi chú!', 'success');
                }
            }
        };

        document.addEventListener("visibilitychange", () => {
            // 🔥 MÁY SỐC TIM ĐIỆN TỪ (DEFIBRILLATOR PROTOCOL V2.0): TRẢM HỒN DAO!
            if (document.visibilityState === 'visible' && app.state.roomCode) {

                // 1. MÁY CHÉM KHÔNG GIAN: Hành quyết ngay lập tức luồng fetch cũ đang kẹt ở cõi hư vô! Tránh nghịch lý dòng thời gian!
                if (app.pollingController) {
                    app.pollingController.abort();
                    app.pollingController = null;
                }

                // 2. Tẩy rửa mọi ma trận trạng thái kẹt
                app.state.isSyncing = false;
                app.isFetchingGameState = false;

                if (app.pollingTimer) {
                    clearTimeout(app.pollingTimer);
                    app.pollingTimer = null;
                }

                // 3. Giáng luồng điện ép xung 350ms tinh khiết nhất để tái sinh!
                app.state.isPolling = true;
                app.pollLoop();
            }
        });

        // 🔥 ÁM SÁT TRÌNH DUYỆT: Tước đoạt hàm alert() mặc định và thay bằng Toast Điện Ảnh!
        window.alert = function (message) {
            const container = document.getElementById('toast-container');
            if (!container) return;
            const toast = document.createElement('div');
            toast.className = 'toast';

            let msgLower = typeof message === 'string' ? message.toLowerCase() : '';
            if (msgLower.includes('lỗi') || msgLower.includes('thất bại') || msgLower.includes('cảnh báo')) {
                toast.classList.add('error');
            } else if (msgLower.includes('thành công') || msgLower.includes('sống lại')) {
                toast.classList.add('success');
            }

            toast.innerHTML = typeof message === 'string' ? message.replace(/\n/g, '<br>') : message;
            container.appendChild(toast);

            // Tự động phá hủy sau 4.5 giây
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4500);
        };

        // =======================================================================
        // 🔥 AUTO REJOIN SESSION LOGIC (LOCAL STORAGE + THỜI GIAN SỐNG 2 TIẾNG)
        // =======================================================================
        const savedSession = localStorage.getItem('werewolf_session');
        if (savedSession) {
            try {
                const session = JSON.parse(savedSession);
                const now = Date.now();
                // Hạn sử dụng: 2 tiếng (7,200,000 mili-giây)
                if (session.last_activity && (now - session.last_activity > 7200000)) {
                    console.log('Phiên làm việc đã hết hạn 2 tiếng. Tiến hành dọn dẹp bộ nhớ.');
                    localStorage.removeItem('werewolf_session');
                    localStorage.removeItem('werewolf_selected_roles');
                    if (session.roomCode) localStorage.removeItem('gmNotes_' + session.roomCode);
                    throw new Error('Expired session'); // Ép văng xuống block catch
                }

                if (session.role === 'gm') {
                    app.state.role = 'gm';
                    app.state.roomCode = session.roomCode;
                    document.getElementById('gm-room-id').innerText = session.roomCode;
                    app.switchScreen('screen-gm');
                    app.startPolling();
                } else if (session.role === 'player') {
                    app.state.role = 'player';
                    app.state.playerId = session.playerId;
                    app.state.roomCode = session.roomCode;
                    if (session.ignoreGMTransfer) {
                        app.state.ignoreGMTransfer = session.ignoreGMTransfer;
                    }
                    document.getElementById('player-room-info').innerText = `Mã phòng: ${session.roomCode} | Tên: ${session.playerName}`;
                    app.switchScreen('screen-player');
                    app.startPolling();
                }
            } catch (e) {
                console.error("Lỗi phục hồi phiên:", e);
                localStorage.removeItem('werewolf_session');
            }
        }

        // =======================================================================
        // 🧹 MÁY HÚT RÁC TỰ ĐỘNG (GARBAGE COLLECTOR)
        // =======================================================================
        try {
            const activeRoomCode = app.state.roomCode; // Nếu session hợp lệ, biến này đã có giá trị
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('gmNotes_')) {
                    const noteRoomCode = key.replace('gmNotes_', '');
                    // Nếu tệp ghi chú này KHÔNG thuộc về phòng đang chơi hiện tại, XÓA NGAY!
                    if (noteRoomCode !== activeRoomCode) {
                        keysToRemove.push(key);
                    }
                }
            }
            keysToRemove.forEach(key => {
                console.log('Garbage Collector: Đã tiêu hủy rác mồ côi -', key);
                localStorage.removeItem(key);
            });
        } catch (err) {
            console.error('Lỗi Garbage Collector:', err);
        }

        // =======================================================================
        // 🔥 THƯỚC ĐO QUANG HỌC (VIEWPORT RESIZE ENGINE) - DIỆT LỖI CHE MÀN HÌNH
        // =======================================================================
        const fixMobileViewport = () => {
            // Đo đạc 1% chiều cao thực sự CÓ THỂ NHÌN THẤY của trình duyệt (Đã trừ thanh địa chỉ)
            let vh = window.innerHeight * 0.01;
            // Bơm thẳng tham số vật lý này vào rễ của CSS (root)
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };

        // Kích hoạt đo đạc ngay khi mở game
        fixMobileViewport();

        // Kích hoạt đo đạc lại mỗi khi người chơi xoay màn hình hoặc trình duyệt thò/thụt thanh công cụ
        window.addEventListener('resize', () => {
            // Chống lag (Debounce) khi sự kiện resize bắn liên tục
            requestAnimationFrame(fixMobileViewport);
        });
        // =======================================================================
        
        // =======================================================================
        // 🔥 HỆ THỐNG KÉO THẢ (DRAGGABLE) CHO NÚT GHI CHÚ VÀ TỪ ĐIỂN
        // =======================================================================
        function makeDraggable(elementId) {
            const elmnt = document.getElementById(elementId);
            if (!elmnt) return;
            
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
            let currentTop = null, currentLeft = null;
            
            // Xử lý Touch (Mobile)
            elmnt.addEventListener('touchstart', dragTouchStart, { passive: false });
            // Xử lý Mouse (PC)
            elmnt.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e = e || window.event;
                e.preventDefault();
                initDrag(e.clientX, e.clientY);
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }

            function dragTouchStart(e) {
                // Không preventDefault ở đây để tránh chặn sự kiện click
                initDrag(e.touches[0].clientX, e.touches[0].clientY);
                // Dùng addEventListener để có thể truyền passive: false cho touchmove!
                document.addEventListener('touchmove', elementTouchDrag, { passive: false });
                document.addEventListener('touchend', closeDragElement);
            }

            function initDrag(clientX, clientY) {
                pos3 = clientX;
                pos4 = clientY;
                elmnt.style.transition = 'none'; // Tắt hiệu ứng để kéo mượt
                
                // Khởi tạo tọa độ tuyệt đối MỘT LẦN DUY NHẤT khi bắt đầu kéo
                const rect = elmnt.getBoundingClientRect();
                currentTop = rect.top;
                currentLeft = rect.left;
                
                // Ngắt neo bottom/right ngay lập tức
                elmnt.style.top = currentTop + "px";
                elmnt.style.left = currentLeft + "px";
                elmnt.style.bottom = "auto";
                elmnt.style.right = "auto";
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                doDrag(e.clientX, e.clientY);
            }

            function elementTouchDrag(e) {
                if (e.cancelable) e.preventDefault(); // CHẶN LĂN TRANG TUYỆT ĐỐI
                doDrag(e.touches[0].clientX, e.touches[0].clientY);
            }
            
            function doDrag(clientX, clientY) {
                pos1 = pos3 - clientX;
                pos2 = pos4 - clientY;
                pos3 = clientX;
                pos4 = clientY;
                
                // Tính toán dựa trên biến nội bộ thay vì liên tục đọc layout của trình duyệt (tránh reflow)
                currentTop = currentTop - pos2;
                currentLeft = currentLeft - pos1;
                
                const maxTop = window.innerHeight - elmnt.offsetHeight;
                const maxLeft = window.innerWidth - elmnt.offsetWidth;
                
                currentTop = Math.max(0, Math.min(currentTop, maxTop));
                currentLeft = Math.max(0, Math.min(currentLeft, maxLeft));
                
                elmnt.style.top = currentTop + "px";
                elmnt.style.left = currentLeft + "px";
            }

            function closeDragElement() {
                elmnt.style.transition = ''; // Bật lại hiệu ứng mặc định
                document.onmouseup = null;
                document.onmousemove = null;
                
                document.removeEventListener('touchmove', elementTouchDrag, { passive: false });
                document.removeEventListener('touchend', closeDragElement);
            }
        }
        
        // Đóng menu thả xuống khi nhấp ra ngoài
        document.addEventListener('click', function(event) {
            const container = document.getElementById('floating-menu-container');
            const menu = document.getElementById('floating-menu-options');
            if (container && menu && menu.classList.contains('active')) {
                if (!container.contains(event.target)) {
                    menu.classList.remove('active');
                }
            }
        });

        // Lắng nghe sự kiện lưu Ghi chú tự động
        document.getElementById('note-textarea').addEventListener('input', function(e) {
            if (app.state.role === 'gm' && app.state.roomCode) {
                localStorage.setItem('gmNotes_' + app.state.roomCode, e.target.value);
            }
        });
