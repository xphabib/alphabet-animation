const fs = require('fs');
const path = require('path');

const CROSS_ICON_FILE = "cross.png";
const CHECK_ICON_FILE = "check.png";
const ANIMATING_MP3 = "animating.mp3";
const WRONG_MP3 = "wrong.mp3";
const CORRECT_MP3 = "correct.mp3";

const inputs = [1, 2, 3];
const timeline = {
    indicators: [
        { type: "cross", tStart: 0.5, tEnd: 1.5 },
        { type: "check", tStart: 2.5, tEnd: 3.5 }
    ]
};

const checkInput = 1 + inputs.length * 2;
const crossInput = 1 + inputs.length * 2 + 1;
const audioAnimIdx = crossInput + 1;

let currentAudioIdx = audioAnimIdx + 1;
const sfxInputs = [];

for (const ind of timeline.indicators) {
    sfxInputs.push({
        idx: currentAudioIdx++,
        type: ind.type,
        delay: Math.round(ind.tStart * 1000)
    });
}

console.log("audioAnimIdx:", audioAnimIdx);
console.log("sfxInputs:", sfxInputs);

let muteConditions = timeline.indicators.map(ind => `between(t,${ind.tStart.toFixed(3)},${ind.tEnd.toFixed(3)})`);
let muteExpr = muteConditions.length > 0 ? muteConditions.join('+') : '0';
let audioFilter = `[${audioAnimIdx}:a]volume='if(${muteExpr}, 0, 1)'[bgm];`;

let amixInputs = `[bgm]`;
for (let i = 0; i < sfxInputs.length; i++) {
    audioFilter += `[${sfxInputs[i].idx}:a]adelay=${sfxInputs[i].delay}:all=1[sfx${i}];`;
    amixInputs += `[sfx${i}]`;
}

audioFilter += `${amixInputs}amix=inputs=${1 + sfxInputs.length}:normalize=0[aout]`;

console.log("Audio Filter:", audioFilter);
