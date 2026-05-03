const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. MongoDB 연결 (사용자님의 비번 mack1234 적용)
const MONGO_URI = "mongodb+srv://dhttmddnjs704:mack1234@cluster0.znnzv5q.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB 연결 성공!"))
  .catch(err => console.error("❌ MongoDB 연결 실패:", err));

// 2. 데이터 모델 정의
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
                    socket.emit('loginError', '아이디 또는 비번이 틀립니다.');
                }
            }
        } catch (e) { socket.emit('loginError', '서버 에러'); }
    });

    socket.on('sendFriendRequest', async (targetName) => {
        const target = await User.findOne({ username: targetName });
        if (!target) return socket.emit('sysError', '상대방 없음');
        if (targetName === loggedInUser) return;
        if (!target.requests.includes(loggedInUser)) {
            target.requests.push(loggedInUser);
            await target.save();
            socket.emit('sysError', '요청 완료');
        }
    });

    socket.on('respondRequest', async ({ sender, accept }) => {
        const me = await User.findOne({ username: loggedInUser });
        const other = await User.findOne({ username: sender });
        me.requests = me.requests.filter(n => n !== sender);
        if (accept) {
            if(!me.friends.includes(sender)) me.friends.push(sender);
            if(!other.friends.includes(loggedInUser)) other.friends.push(loggedInUser);
            await other.save();
        }
        await me.save();
        socket.emit('updateFriends', me.friends);
        socket.emit('updateRequests', me.requests);
    });

    socket.on('joinRoom', (f) => socket.join([loggedInUser, f].sort().join('-')));
    socket.on('sendMessage', (d) => io.to([d.sender, d.receiver].sort().join('-')).emit('receiveMessage', d));
});

server.listen(process.env.PORT || 3000);
