const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MONGO_URI = "mongodb+srv://dhttmddnjs704:mack1234@cluster0.znnzv5q.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB 연결 성공!"))
  .catch(err => console.error("❌ MongoDB 연결 실패:", err));

// 데이터 모델 정의
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    friends: [String],
    requests: [String]
});
const User = mongoose.model('User', userSchema);

// [추가] 채팅 내용 저장용 모델
const chatSchema = new mongoose.Schema({
    room: String,
    sender: String,
    text: String,
    timestamp: { type: Date, default: Date.now }
});
const Chat = mongoose.model('Chat', chatSchema);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    let loggedInUser = "";

    socket.on('login', async ({ username, password, isSignUp }) => {
        try {
            if (isSignUp) {
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
                } else { socket.emit('loginError', '정보가 틀립니다.'); }
            }
        } catch (e) { socket.emit('loginError', '서버 에러'); }
    });

    // 친구 관련 로직 (기존과 동일)
    socket.on('sendFriendRequest', async (targetName) => {
        const target = await User.findOne({ username: targetName });
        if (target && !target.requests.includes(loggedInUser)) {
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

    // [수정] 방 입장 시 기존 대화 내용 불러오기
    socket.on('joinRoom', async (f) => {
        const roomName = [loggedInUser, f].sort().join('-');
        socket.join(roomName);
        // DB에서 해당 방의 이전 메시지 50개 가져오기
        const history = await Chat.find({ room: roomName }).sort({ timestamp: 1 }).limit(50);
        socket.emit('loadHistory', history);
    });

    // [수정] 메시지 전송 시 DB 저장
    socket.on('sendMessage', async (d) => {
        const roomName = [d.sender, d.receiver].sort().join('-');
        const newMsg = new Chat({
            room: roomName,
            sender: d.sender,
            text: d.text
        });
        await newMsg.save(); // DB에 영구 저장 (상대가 오프라인이어도 저장됨)
        io.to(roomName).emit('receiveMessage', d);
    });
});

server.listen(process.env.PORT || 3000);
