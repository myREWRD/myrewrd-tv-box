const assert = require('node:assert/strict');
const {gameDayUrl} = require('../src/game-day-url');
const expected='https://www.youtube.com/embed/abcdefghijk?autoplay=1&mute=1&playsinline=1';
for(const url of ['https://www.youtube.com/watch?v=abcdefghijk&list=ignored','https://youtu.be/abcdefghijk','https://youtube.com/live/abcdefghijk','https://m.youtube.com/shorts/abcdefghijk','https://www.youtube.com/embed/abcdefghijk']) assert.equal(gameDayUrl(url),expected);
for(const url of ['https://tv.youtube.com/','https://www.hulu.com/','https://youtube.com.evil.invalid/watch?v=abcdefghijk','http://youtube.com/watch?v=abcdefghijk','https://user:secret@youtube.com/watch?v=abcdefghijk','https://youtube.com/watch?v=bad','https://youtube.com:444/watch?v=abcdefghijk']) assert.equal(gameDayUrl(url),url);
console.log('PASS public YouTube video layout normalization without changing provider or invalid URLs');
