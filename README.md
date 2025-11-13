# PLAYCODE.GG

> Real-time multiplayer quiz platform - Anyone can easily create, share, and play quizzes together

🔗 **Live Service:** [https://playcode.gg](https://playcode.gg)

---

## 📖 Table of Contents
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Technical Challenges and Solutions](#-technical-challenges-and-solutions)
- [Performance Optimization](#-performance-optimization)
- [Project Highlights](#-project-highlights)

---

## ✨ Key Features

### Core Features
- **Real-time Multiplayer Quiz** - Up to 12 players can join and compete simultaneously
- **Various Question Types** - Support for short answer, multiple choice, image, YouTube video, and audio questions
- **Guest Mode** - Play instantly without registration
- **Real-time Chat** - Communicate with other players during the game
- **Dynamic Scoreboard** - Check rankings and scores in real-time
- **Percentile Ranking** - Shows what percentile you're in when the game ends
- **Quiz Sharing** - Share quizzes via invite codes

### Quiz Creation
- **Drag and Drop** image upload
- **YouTube API Integration** - Specific segment playback, video/audio modes
- **Auto-save** - Prevent work loss with instant save per question
- **Public/Private** settings
- **Question Order Randomization**

### Community
- Comment and recommendation system
- Report feature (Admin review)
- Admin dashboard (Statistics, report management, user management)

---

## 🛠 Tech Stack

### Backend
- **Node.js** + **Express.js** - RESTful API and web server
- **MongoDB** (Mongoose) - Store user, quiz, and session data
- **Redis** - Real-time concurrency control and caching
  - Atomic first correct answer determination (SET NX)
  - Connection counter management
- **Socket.IO** - Real-time bidirectional communication

### Frontend
- **EJS** - Server-side rendering
- **TailwindCSS** - Responsive UI
- **Vanilla JavaScript** - Client logic

### Infrastructure & DevOps
- **AWS S3** - Image storage (Presigned URL)
- **JWT** - httpOnly cookie-based authentication
- **OAuth 2.0** - Social login (Kakao, Google, Naver)
- **YouTube IFrame API** - Synchronized video playback

---

## 🚀 Technical Challenges and Solutions

These are the technical problems encountered while running the actual service and the resolution process.

---

### 1. Scalability: Client-Side Timer Strategy

**🔴 Problem**
- Initially managed all game session timers on the server using `setTimeout`
- With over 1,000 sessions, used ~50MB memory and 5-10% CPU
- Risk of timer leaks and potential timer delays under server load

**💡 Solution**

Switched to a hybrid approach:
```javascript
// Server: Only send timer value
io.to(sessionId).emit('question-start', {
    timeLimit: 90,              // For client countdown
    questionStartAt: new Date(), // For reconnection calculation
});

// Client: Manage timer directly
setTimeout(() => revealAnswer(), timeLimit * 1000);

// Reconnection: Calculate elapsed time
const elapsed = Date.now() - questionStartAt.getTime();
const remaining = Math.max(0, timeLimit * 1000 - elapsed);
```

**✅ Result**
- Server memory/CPU usage **nearly 0%**
- Can stably handle 10,000+ simultaneous sessions
- Accurate remaining time restoration on reconnection

---

### 2. Performance: Base64 → AWS S3 Image Storage Migration

**🔴 Problem**
- Initially stored images as Base64 encoded directly in MongoDB
- Quiz list loading with images took **over 2 minutes**
- Slow query speed due to limited performance of MongoDB free tier (M0)

**💡 Solution**

Migrated to AWS S3 Presigned URL approach:
```javascript
// On image upload
const s3Key = `quiz-images/${quizId}/${timestamp}.${ext}`;
await s3.upload({ Bucket, Key: s3Key, Body: imageBuffer });

// On retrieval: Generate Presigned URL (valid for 1 hour)
const imageUrl = s3.getSignedUrl('getObject', {
    Bucket, Key: s3Key, Expires: 3600
});
```

**✅ Result**
- Quiz list loading time: **2+ minutes → under 1 second**
- Drastically reduced MongoDB document size (~1MB → ~100 bytes per image)
- Distributed image loading to CDN, reducing server burden

---

### 3. Concurrency: Resolving First Correct Answer Race Condition with Redis

**🔴 Problem**
- When multiple players submit correct answers simultaneously, race condition occurred in first answer determination
- Bug where two or more players received 2 points (first answer bonus) simultaneously

**💡 Solution**

Utilized Redis atomic operation (`SET NX`):
```javascript
// Atomic first correct answer determination with Redis
const redisKey = `first:${sessionId}:${questionIndex}`;
const result = await redisClient.set(redisKey, userId, {
    NX: true,  // Only set if key doesn't exist (atomic!)
    EX: 3600   // Auto-delete after 1 hour
});

const isFirstCorrectUser = (result === 'OK');
const scoreIncrement = isFirstCorrectUser ? 2 : 1;
```

**✅ Result**
- Completely resolved race condition
- Accurate first correct answer determination even with millisecond-level simultaneous submissions
- Works correctly in cluster mode

---

### 4. Performance: Resolving N+1 Query Problem

**🔴 Problem**
- When retrieving 20 quizzes in quiz list, took **over 4 seconds**
- N+1 problem occurred by querying creator information individually for each quiz
- Full Collection Scan due to missing indexes

**💡 Solution**

1. **Denormalized creator nickname into Quiz schema**
```javascript
// Save creator nickname when creating Quiz
const quiz = new Quiz({
    title, description,
    creatorId: user._id,
    creatorNickname: user.nickname  // Denormalization!
});
```

2. **Added indexes to necessary fields**
```javascript
quizSchema.index({ isPublic: 1, createdAt: -1 });
quizSchema.index({ creatorId: 1 });
```

**✅ Result**
- Quiz list loading: **4 seconds → 0.3 seconds** (about 13x improvement)
- DB query count: reduced from 21 → 1
- Denormalization trade-off: requires update on nickname change, but prioritizes query performance

---

### 5. Real-time Synchronization: YouTube Simultaneous Playback Issue

**🔴 Problem**
- All players must watch YouTube video at exactly the same point for fair game progression
- Playback timing differed for each player due to network latency and loading time

**💡 Solution**

Ready confirmation + simultaneous playback approach:
```javascript
// 1. All clients notify server after YouTube loading completes
socket.emit('client-ready', { sessionId });

// 2. Server: simultaneous start signal when all players ready
if (allPlayersReady) {
    io.to(sessionId).emit('question-start', {
        timeLimit: 90,
        questionStartAt: new Date()
    });
}

// 3. Client: play video + start timer simultaneously
youtubePlayer.playVideo();
startCountdown(timeLimit);
```

**✅ Result**
- All players start watching video simultaneously
- Improved user experience with "Loading..." UI instead of 2-3 second loading time
- Guaranteed fair game progression

---

### 6. Security: JWT httpOnly Cookie + Hash-Based Answer Verification

**🔴 Problem**
- Initially stored JWT token in localStorage → vulnerable to XSS attacks
- Sent answers in plaintext to client → could be viewed in developer tools

**💡 Solution**

1. **Migrated JWT to httpOnly cookie**
```javascript
res.cookie('accessToken', token, {
    httpOnly: true,  // No JavaScript access
    secure: true,    // HTTPS only
    sameSite: 'strict'
});
```

2. **Send answers as SHA-256 hash**
```javascript
// Server: Hash answers
const hashedAnswers = quiz.answers.map(ans =>
    crypto.createHash('sha256')
        .update(ans.replace(/\s+/g, '').toLowerCase())
        .digest('hex')
);

// Client: hash user input for comparison
const userAnswerHash = sha256(userInput);
if (hashedAnswers.includes(userAnswerHash)) {
    socket.emit('correct', { sessionId, answer: userInput });
}

// Server: Re-verify
const isCorrect = hashedAnswers.includes(hashAnswer(answer));
```

**✅ Result**
- Protected authentication token from XSS attacks
- Impossible to leak answers from client
- Prevent cheating with double verification on server

---

### 7. Data Management: MongoDB TTL + Percentile Caching

**🔴 Problem**
- Even after game session ends, continues to accumulate in DB, wasting storage
- Had to query all records every time to calculate "top X%" when game ends

**💡 Solution**

1. **Auto-cleanup with MongoDB TTL Index**
```javascript
gameSessionSchema.index({
    startedAt: 1
}, {
    expireAfterSeconds: 10800  // Auto-delete after 3 hours
});
```

2. **Percentile threshold caching**
```javascript
// Calculate once and save when game ends
const percentileThresholds = {
    top1: allScores[Math.floor(totalPlayers * 0.01)],
    top3: allScores[Math.floor(totalPlayers * 0.03)],
    top10: allScores[Math.floor(totalPlayers * 0.10)],
    top30: allScores[Math.floor(totalPlayers * 0.30)],
};

await QuizRecord.findByIdAndUpdate(quizRecordId, {
    $set: { percentileThresholds }
});

// Each player only compares with thresholds (O(1))
const userPercentile = calculatePercentile(userScore, percentileThresholds);
```

**✅ Result**
- No need to manage DB capacity with automatic session data cleanup
- Percentile calculation: O(N * M) → O(N) + O(M) (N=players, M=records)
- Improved game end response speed

---

### 8. Async Processing: Data Consistency Issue on Reconnection

**🔴 Problem**
- Bug where game session creator couldn't get correct answers recognized on reconnection
- During reconnection logic, while hashing quiz data, another async logic overwrote with plaintext data

**💡 Solution**

```javascript
// 🔴 Wrong code: async processing order not guaranteed
const hashedQuiz = hashQuizData(quiz);  // Hash
session.cachedQuizData = hashedQuiz;
// ... other logic overwrites with plaintext

// ✅ Fix: verify cache and prevent regeneration
if (session.cachedQuizData &&
    session.cachedQuizData.questions[0].answers[0].length === 64) {
    // Already hashed data → use as is
    quizDataToSend = session.cachedQuizData;
} else {
    // Plaintext or missing → regenerate
    quizDataToSend = hashQuizData(quiz);
    session.cachedQuizData = quizDataToSend;
    await session.save();
}
```

**✅ Result**
- Guaranteed data consistency on reconnection
- Improved performance by preventing unnecessary re-hashing

---

## ⚡ Performance Optimization

### Key Improvements

|          Metric                | Before    | After        | Improvement       |
|-------------------------------|-----------|-------------|------------------|
| Quiz list loading             | 2+ min    | Under 1s    | **120x** ⬆️      |
| Query 20 quizzes              | 4s        | 0.3s        | **13x** ⬆️       |
| DB query count (N+1)          | 21        | 1           | **95%** ⬇️       |
| Server memory (1000 sessions) | ~50MB     | Nearly none | **99%** ⬇️       |
| Concurrent sessions capacity  | ~1,000    | 10,000+     | **10x** ⬆️       |

### Optimization Strategies

1. **Image storage migration** - Base64 → AWS S3 Presigned URL
2. **Query optimization** - Resolve N+1 problem, add indexes, denormalization
3. **Load distribution** - Move timer calculation to client
4. **Concurrency control** - Utilize Redis atomic operations
5. **Caching strategy** - Percentile threshold caching, quiz data caching
6. **Auto-cleanup** - Automatic deletion of unnecessary data with MongoDB TTL Index

---

## 🏆 Project Highlights

### Scalable Architecture
- Can handle **10,000+ concurrent game sessions** on a single server
- Minimize server burden with client-side timers and Redis-based concurrency control
- Automatic data cleanup with MongoDB TTL Index (reduced operational burden)

### Real-time Synchronization & Fairness
- Socket.IO-based real-time bidirectional communication
- All players watch YouTube videos at exactly the same point
- Guaranteed accuracy of millisecond-level answer determination with Redis SET NX

### Security & Anti-Cheating
- Block XSS attacks with JWT httpOnly cookie
- SHA-256 hash-based answer verification (cannot leak from client)
- Perfect cheating prevention with server-side double verification

### Performance-Centric Design
- **120x faster loading** (Base64 → S3)
- **13x faster queries** (Resolved N+1 problem)
- **99% memory reduction** (Client-side timer)

### User Experience Improvements
- Play instantly with guest mode (removed registration barrier)
- Intuitive quiz creation with drag and drop
- Prevent work loss with auto-save per question
- Perfect game state restoration on reconnection

---

## 📝 License

All rights reserved. This code is provided for portfolio demonstration purposes only.

---

**Developer: Lee Seonghyeon**

[한국어 버전](./README.ko.md)
