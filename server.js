const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 임시 데이터 저장소 (서버 배포 시 초기화됨)
const users = {}; 
const chatRooms = {}; 
const userSockets = {}; 

io.on('connection', (socket) => {
    let loggedInUser = "";

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
                socket.emit('updateFriends', users[username].friends || []);
                socket.emit('updateRequests', users[username].requests || []);
            } else {
                socket.emit('loginError', '아이디 또는 비밀번호가 틀렸거나 서버가 재시작되어 계정이 삭제되었습니다. 다시 회원가입 해주세요.');
            }
        }
    });

    socket.on('sendFriendRequest', (targetName) => {
        if (!users[targetName]) return socket.emit('sysError', '사용자를 찾을 수 없습니다.');
        if (targetName === loggedInUser) return socket.emit('sysError', '자기 자신은 추가할 수 없습니다.');
        if (users[targetName].friends.includes(loggedInUser)) return socket.emit('sysError', '이미 친구입니다.');
        
        if (!users[targetName].requests.includes(loggedInUser)) {
            users[targetName].requests.push(loggedInUser);
        }

        if (userSockets[targetName]) {
            io.to(userSockets[targetName]).emit('updateRequests', users[targetName].requests);
        }
        socket.emit('sysError', '친구 요청을 보냈습니다.');
    });

    socket.on('respondRequest', ({ sender, accept }) => {
        if (!users[loggedInUser]) return;
        users[loggedInUser].requests = users[loggedInUser].requests.filter(u => u !== sender);

        if (accept) {
            if (!users[loggedInUser].friends.includes(sender)) users[loggedInUser].friends.push(sender);
            if (!users[sender].friends.includes(loggedInUser)) users[sender].friends.push(loggedInUser);
            
            socket.emit('updateFriends', users[loggedInUser].friends);
            if (userSockets[sender]) {
                io.to(userSockets[sender]).emit('updateFriends', users[sender].friends);
            }
        }
        socket.emit('updateRequests', users[loggedInUser].requests);
    });

    socket.on('joinRoom', (friend) => {
        const roomName = [loggedInUser, friend].sort().join('-');
        socket.join(roomName);
        socket.emit('loadHistory', chatRooms[roomName] || []);
    });

    socket.on('sendMessage', (data) => {
        const roomName = [data.sender, data.receiver].sort().join('-');
        const msg = { ...data, timestamp: new Date().toLocaleTimeString() };
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
