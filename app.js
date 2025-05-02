const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const User = require('./models/User');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const mongoURI = process.env.MONGO_URI;

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401); // Unauthorized

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Forbidden
        req.user = user; // 사용자 정보 요청 객체에 삽입
        next();
    });
}

// MongoDB 연결
mongoose.connect('mongodb://localhost:27017/mydatabase', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connected');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// 미들웨어 설정
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// 라우트 설정
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/my-info', authenticateToken, async (req, res) => {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(user);
});


app.post('/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // 입력 데이터 확인
        if (!username || !email || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        // 비밀번호 해시 처리
        const hashedPassword = await bcrypt.hash(password, 10);

        // 새로운 사용자 생성
        const newUser = new User({ username, email, password: hashedPassword });

        // 데이터베이스에 저장
        await newUser.save();

        // 응답
        res.status(201).json({ message: 'User registered successfully', user: newUser });
    } catch (err) {
        console.error('Error details:', err); // 오류 상세 정보 출력
        res.status(500).json({ message: 'Error registering user', error: err.message });
    }
});

// 로그인 라우트
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(400).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
    }

    // ✅ JWT 생성
    const token = jwt.sign(
        { id: user._id, username: user.username },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    res.json({ message: 'Login successful', token });
});

// 서버 시작
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});