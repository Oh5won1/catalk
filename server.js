const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 데이터 저장소 (서버 재시작 시 초기화됨)
const users = {}; // { username: { password, friends: [], requests: [] } }
const chatRooms = {}; 
const userSockets = {}; // 실시간 알림을 위한 소켓 저장소

io.on('connection', (socket) => {
    let loggedInUser = "";

    // [로그인/회원가입]
    socket.on('login', ({ username, password, isSignUp }) => {
        if (isSignUp) {
            if (users[username]) return socket.emit('loginError', '이미 존재하는 아이디입니다.');
            users[username] = { password, friends: [], requests: [] };
            socket.emit('loginSuccess', username);
        } else {
            if (users[username] && users[username].password === password) {
                loggedInUser = username;
                userSockets[username] = socket.id;
                socket.emit('loginSuccess', username);
                socket.emit('updateFriends', users[username].friends);
                socket.emit('updateRequests', users[username].requests);
            } else {
                socket.emit('loginError', '아이디 또는 비밀번호가 틀렸습니다.');
            }
        }
    });

    // [친구 요청 보내기]
    socket.on('sendFriendRequest', (targetName) => {
        if (!users[targetName]) return socket.emit('sysError', '사용자를 찾을 수 없습니다.');
        if (targetName === loggedInUser) return socket.emit('sysError', '나 자신은 추가할 수 없습니다.');
        if (users[targetName].friends.includes(loggedInUser)) return socket.emit('sysError', '이미 친구입니다.');
        if (users[targetName].requests.includes(loggedInUser)) return socket.emit('sysError', '이미 요청을 보냈습니다.');

        users[targetName].requests.push(loggedInUser);
        
        // 상대방이 접속 중이면 즉시 요청 알림 업데이트
        if (userSockets[targetName]) {
            io.to(userSockets[targetName]).emit('updateRequests', users[targetName].requests);
        }
        socket.emit('sysError', '친구 요청을 보냈습니다.');
    });

    // [친구 요청 수락/거절 처리]
    socket.on('respondRequest', ({ sender, accept }) => {
        if (!users[loggedInUser]) return;
        
        // 요청 목록에서 제거
        users[loggedInUser].requests = users[loggedInUser].requests.filter(u => u !== sender);

        if (accept) {
            // 양방향 친구 추가
            if (!users[loggedInUser].friends.includes(sender)) users[loggedInUser].friends.push(sender);
            if (!users[sender].friends.includes(loggedInUser)) users[sender].friends.push(loggedInUser);
            
            // 실시간 목록 업데이트 전송
            socket.emit('updateFriends', users[loggedInUser].friends);
            if (userSockets[sender]) {
                io.to(userSockets[sender]).emit('updateFriends', users[sender].friends);
            }
        }
        
        socket.emit('updateRequests', users[loggedInUser].requests);
    });

    // [채팅방 입장]
    socket.on('joinRoom', (friend) => {
        const roomName = [loggedInUser, friend].sort().join('-');
        socket.join(roomName);
        socket.emit('loadHistory', chatRooms[roomName] || []);
    });

    // [메시지 전송]
    socket.on('sendMessage', (data) => {
        const roomName = [data.sender, data.receiver].sort().join('-');
        const msg = { 
            ...data, 
            text: `[${data.lang.toUpperCase()}] ${data.text}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        };
        if (!chatRooms[roomName]) chatRooms[roomName] = [];
        chatRooms[roomName].push(msg);
        io.to(roomName).emit('receiveMessage', msg);
    });

    socket.on('disconnect', () => {
        if (loggedInUser) delete userSockets[loggedInUser];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
