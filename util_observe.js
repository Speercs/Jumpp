'use strict';

let whichToScan = {};

let roomsToScanNow = [];

let initialized = false;

let roomsGettingScanned = {};

let observersInRangeCache = {};

function preUpdate() {
  try {
    if (!initialized) initialize();
  } catch (err) {
    console.log(`Observe.initialize: ${err}`);
  }
}

function initialize() {
  _(Memory.rooms).keys()
      .filter(k => Memory.rooms[k]._nextScan)
      .forEach(n => insertScan(n, Memory.rooms[n]._nextScan))
      .value();
  initialized = true;
  return true;
}

global.check = function() {
  return checkNextScanConsistency();
}

function checkNextScanConsistency() {
  function checkRoom(roomName) {
    let nextScan = Memory.rooms[roomName]._nextScan;
    if (nextScan > Game.time && !whichToScan[nextScan].has(roomName)) {
      console.log(`Room ${roomName} with nextScan t+${nextScan-Game.time} should be in whichToScan and isn't.`);
    }
    if (nextScan <= Game.time && !roomsGettingScanned[roomName] && !_.find(roomsToScanNow, n => n == roomName)) {
      console.log(`Room ${roomName} with nextScan t-${Game.time-nextScan} should be in roomsGettingScanned or roomsToScanNow and isn't.`);
    }
  }

  _(Memory.rooms).keys()
      .filter(k => Memory.rooms[k]._nextScan)
      .forEach(roomName => checkRoom(roomName))
      .value();

  for (let roomName of roomsToScanNow) {
    if (!(Memory.rooms[roomName]._nextScan <= Game.time)) {
      console.log(`Room ${roomName} in roomsToScanNow should have _scanTime at or below Game.time (${Game.time}), but is ${Memory.rooms[roomName]._nextScan}`);
    }
  }

  for (let roomName of _.keys(roomsGettingScanned)) {
    if (!(Memory.rooms[roomName]._nextScan <= Game.time)) {
      console.log(`Room ${roomName} in roomsGettingScanned should have _scanTime at or below Game.time (${Game.time}), but is ${Memory.rooms[roomName]._nextScan}`);
    }
  }

  for (let nextScan of _.keys(whichToScan)) {
    for (let roomName of whichToScan[nextScan]) {
      if (Memory.rooms[roomName]._nextScan != nextScan) {
        console.log(`Room ${roomName} should be in whichToScan at t+${nextScan-Game.time} and is not.`);
      }
    }
  }

  return OK;
}

function postUpdate() {
  try {
    postUpdateImpl();
  } catch (err) {
    console.log('Observe ' + err);
  }
}

function postUpdateImpl() {
  // roomsGettingScanned is the rooms for which we issued observeRoom operations last tick.
  // All should be visible, all should have run a room update, and all should have set new
  // nextScan times.
  let strays = _.keys(roomsGettingScanned);
  roomsGettingScanned = {};
  if (strays.length) {
    console.log(`Strays in roomsGettingScanned: ${strays}`);
    // Put them back in roomsToScanNow, at the front.
    roomsToScanNow = _.union(strays, roomsToScanNow);
  }

  if (DO_NEW_OBSERVERS) {
    if (whichToScan[Game.time]) {
      whichToScan[Game.time].forEach(roomName => roomsToScanNow.push(roomName));
    }

    for (const roomName of roomsToScanNow) {
      tryToScanRoom(roomName);
    }

    roomsToScanNow = _.difference(roomsToScanNow, _.keys(roomsGettingScanned));
  }

  delete whichToScan[Game.time];

  // TODO: Infrequent checks. Stuff like:
  // Verify that whichToScan has no keys in the past.
}

function tryToScanRoom(roomName) {
  // Don't scan if it's visible.
  if (Game.rooms[roomName]) return;

  let observerRooms = getObserversInRange(roomName);
  if (observerRooms.length == 0) {
    console.log(`${roomName} has _nextScan, but is unscannable`);
  } else {
    let observers = _.map(observerRooms, n => Game.rooms[n].observer);
    let winner = _.find(observers, o => !o._busy);
    if (winner) {
      //winner.room.logError(`Scanning room ${roomName}`);
      let result = winner.observeRoom(roomName);
      if (result == OK) {
        winner._busy = true;
        roomsGettingScanned[roomName] = winner.room.name;
        Game.observerIntents = (Game.observerIntents || 0) + 1;
      } else {
        room.logError('Failed scan(2). This should never happen.');
      }
    }
  }
}

function getObserversInRange(roomName) {
  if (observersInRangeCache[roomName] &&
      observersInRangeCache[roomName].timestamp > Game.time - 10000) {
    return observersInRangeCache[roomName].rooms;
  }

  let rooms = findObserversInRange(roomName);
  let timestamp = Game.time;
  observersInRangeCache[roomName] = {rooms, timestamp};
  return rooms;
}

function findObserversInRange(roomName) {
  if (!Game._observerBases) {
    Game._observerBases = _.filter(Game.rooms,
        b => b.controller &&
        b.my &&
        b.controller.level == 8 &&
        b.observer);
  }

  return _(Game._observerBases)
      .filter(b => Game.map.getRoomLinearDistance(roomName, b.name) <= OBSERVER_RANGE)
      .map('name')
      .value();
}

function clearNextScan(roomName) {
  clearOldNextScanTime(roomName);
  Memory.rooms[roomName]._nextScan = undefined;
}

function setNextScan(roomName, nextScan, reason) {
  if (roomName.isValidRoomName() && !Memory.rooms[roomName]) {
    console.log(`Observe.setNextScan: Initializing room memory for ${roomName}`);
    Memory.rooms[roomName] = {};
  }
  clearOldNextScanTime(roomName);
  
  let scanTime = Game.time + nextScan;
  Memory.rooms[roomName]._nextScan = scanTime;

  insertScan(roomName, scanTime);
  return OK;
}

function insertScan(roomName, scanTime) {
  if (scanTime <= Game.time) {
    roomsToScanNow.push(roomName);
    return;
  }

  if (!whichToScan[scanTime]) {
    whichToScan[scanTime] = new Set([roomName]);
  } else {
    whichToScan[scanTime].add(roomName);
  }
}

function clearOldNextScanTime(roomName) {
  if (!Memory.rooms[roomName]) return;

  let oldScanTime = Memory.rooms[roomName]._nextScan;
  if (whichToScan[oldScanTime]) {
    whichToScan[oldScanTime].delete(roomName);
  }
  delete roomsGettingScanned[roomName];
}

module.exports = {
  clearNextScan,
  postUpdate,
  preUpdate,
  setNextScan
}