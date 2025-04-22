const express = require('express');
const app = express();

app.listen(8080, function(){
    console.log('listening on 8080')
});

app.get('/login', function(req, res){
    res.send('로그인페이지');
});

app.get('/firstpage', function(req, res){
    res.send('첫페이지');
});

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html')
});