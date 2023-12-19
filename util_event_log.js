'use strict';

const NUM_EVENTS_TO_SAVE = 50;

exports.writeEntry = function(eventCode, roomName, message) {
    if (!Memory.eventLog) {
        Memory.eventLog = [];
    }

    //console.log(`Got ${exports.eventCodeNames[eventCode]} log entry.`);

    Memory.eventLog.unshift({
        timestamp: Game.time,
        eventCode: eventCode,
        roomName: roomName,
        message: message});
    Memory.eventLog = _.slice(Memory.eventLog, 0, NUM_EVENTS_TO_SAVE);
}

function historyUrl(roomName, timestamp, body) {
    return `<a href = 'https://screeps.com/${Game.shard.ptr ? 'ptr' : 'a'}/#!/history/${Game.shard.name}/${roomName}`
        + `?t=${timestamp}'>${body}</a>`;
}

function eventString(event) {
    return `${Game.time - event.timestamp} ticks ago, ` +
        `${historyUrl(event.roomName, event.timestamp, event.roomName)}, ` +
        `${exports.eventCodeNames[event.eventCode]}, ${event.message}`;
}

global.eventReport = function(eventCode) {
    for (let i=0; i < Memory.eventLog.length; i++) {
        let event = Memory.eventLog[i];
        let url = historyUrl(event.roomName, event.timestamp);
        console.log(eventString(event));
    }
}

exports.eventCodeNames = [
    '0',
    'POWER_BANK',
    'INVADERS',
    'FIREFIGHTER',
    'BUILDER_DEBUG',
    'ENGAGEMENT',
    'ERROR',
    'WORM',
    'DEBUG'];

exports.POWER_BANK = 1;
exports.INVADERS = 2;
exports.FIREFIGHTER = 3;
exports.BUILDER_DEBUG = 4;
exports.ENGAGEMENT = 5;
exports.ERROR = 6;
exports.WORM = 7;
exports.DEBUG = 8;
