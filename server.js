const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. MongoDB 연결 (사용자님이 제공하신 URI 적용)
const MONGO_URI = "mongodb+srv://dhttmddnjs704:mack1234@cluster0.znnzv5q.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB 연결 성공! 데이터가 안전하게 저장됩니다."))
  .catch(err => console.error("❌ MongoDB 연결 실패:", err));

// 2. 데이터 모델 정의 (스키마)
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    friends: [String],
    requests: [String]
});
const User = mongoose.model('User', userSchema);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    let loggedInUser = "";

    // 로그인 및 회원가입 처리
    socket.on('login', async ({ username, password, isSignUp }) => {
        try {
            if (isSignUp) {
                const existing = await User.findOne({ username });
                if (existing) return socket.emit('loginError', '이미 존재하는 아이디입니다.');
                
                const newUser = new User({ username, password, friends: [], requests: [] });
                await newUser.save();
                socket.emit('loginSuccess', username);
            } else {
                const user = await User.findOne({ username, password });
                if (user) {
                    loggedInUser = username;
                    socket.emit('loginSuccess', username);
                    socket.emit('updateFriends', user.friends);
                    socket.emit('updateRequests', user.requests);
                } else {
                    socket.emit('loginError', '아이디 또는 비번이 틀립니다. 다시 확인해주세요.');
                }
            }
        } catch (e) {
            socket.emit('loginError', '서버 통신 중 오류가 발생했습니다.');
        }
    });

    // 친구 요청 보내기
    socket.on('sendFriendRequest', async (targetName) => {
        try {
            const target = await User.findOne({ username: targetName });
            if (!target) return socket.emit('sysError', '상대방을 찾을 수 없습니다.');
            if (targetName === loggedInUser) return socket.emit('sysError', '자신에게는 보낼 수 없습니다.');
            
            if (!target.requests.includes(loggedInUser) && !target.friends.includes(loggedInUser)) {
                target.requests.push(loggedInUser);
                await target.save();
                socket.emit('sysError', '친구 요청을 보냈습니다!');
            } else {
                socket.emit('sysError', '이미 친구이거나 대기 중인 요청이 있습니다.');
            }
        } catch (e) { console.error(e); }
    });

    // 친구 요청 수락/거절
    socket.on('respondRequest', async ({ sender, accept }) => {
        try {
            const me = await User.findOne({ username: loggedInUser });
            const other = await User.findOne({ username: sender });

            me.requests = me.requests.filter(name => name !== sender);
            
            if (accept) {
                if(!me.friends.includes(sender)) me.friends.push(sender);
                if(!other.friends.includes(loggedInUser)) other.friends.push(loggedInUser);
                await other.save();
            }
            await me.save();
            
            socket.emit('updateFriends', me.friends);
            socket.emit('updateRequests', me.requests);
        } catch (e) { console.error(e); }
    });

    // 채팅 로직
    socket.on('joinRoom', (friend) => {
        const room = [loggedInUser, friend].sort().join('-');
        socket.join(room);
    });

    socket.on('sendMessage', (data) => {
        const room = [data.sender, data.receiver].sort().join('-');
        io.to(room).emit('receiveMessage', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
