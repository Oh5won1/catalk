const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 데이터 저장용 (실제 서비스 시에는 DB 연결 권장)
const users = {}; // { username: { password, friends: [] } }
const chatRooms = {}; // { "user1-user2": [messages] }

io.on('connection', (socket) => {
    let loggedInUser = "";

    // 1. 회원가입 및 로그인
    socket.on('login', ({ username, password, isSignUp }) => {
        if (isSignUp) {
            if (users[username]) return socket.emit('loginError', '이미 존재하는 아이디입니다.');
            users[username] = { password, friends: [] };
            socket.emit('loginSuccess', username);
        } else {
            if (users[username] && users[username].password === password) {
                loggedInUser = username;
                socket.emit('loginSuccess', username);
                socket.emit('updateFriends', users[username].friends);
            } else {
                socket.emit('loginError', '아이디 또는 비밀번호가 틀렸습니다.');
            }
        }
    });

    // 2. 친구 추가
    socket.on('addFriend', (friendName) => {
        if (users[friendName] && friendName !== loggedInUser) {
            if (!users[loggedInUser].friends.includes(friendName)) {
                users[loggedInUser].friends.push(friendName);
                socket.emit('updateFriends', users[loggedInUser].friends);
            } else {
                socket.emit('sysError', '이미 친구 목록에 있습니다.');
            }
        } else {
            socket.emit('sysError', '사용자를 찾을 수 없습니다.');
        }
    });

    // 3. 1:1 대화방 입장 및 기록 로드
    socket.on('joinRoom', (friendName) => {
        const roomName = [loggedInUser, friendName].sort().join('-');
        socket.join(roomName);
        const history = chatRooms[roomName] || [];
        socket.emit('loadHistory', history);
    });

    // 4. 메시지 전송 및 자동 번역(Mock)
    socket.on('sendMessage', (data) => {
        const roomName = [data.sender, data.receiver].sort().join('-');
        
        // 실제 번역 API 연결 전 가이드: 설정 언어에 따라 말머리 부여
        const translatedText = `[${data.lang.toUpperCase()}] ${data.text}`;
        const msgObj = { 
            ...data, 
            text: translatedText, 
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        };
        
        if (!chatRooms[roomName]) chatRooms[roomName] = [];
        chatRooms[roomName].push(msgObj);

        io.to(roomName).emit('receiveMessage', msgObj);
    });

    // 5. 동작 감지 상태 공유 (온라인/자리비움)
    socket.on('statusChange', (data) => {
        socket.broadcast.emit('userStatusUpdate', data);
    });
});

// 포트 설정 (Render 배포를 위해 process.env.PORT 사용)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 http://localhost:${PORT} 에서 작동 중입니다.`);
});