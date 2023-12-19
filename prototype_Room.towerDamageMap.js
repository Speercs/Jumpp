'use strict';

let towerDamageMaps = {};

function getNumActiveTowers(roomName) {
  let room = Game.rooms[roomName];

  if (room) {
    return room.activeTowers.length;
  }

  let towerPositions = Memory.rooms[roomName].towerPositions;

  return (towerPositions && towerPositions.length) || 0;
}

function createTowerDamageMap(roomName) {
  let terrain = Game.map.getRoomTerrain(roomName);
  let map = new PathFinder.CostMatrix;
  towerDamageMaps[roomName] = new PathFinder.CostMatrix;
  for (let y = 0; y < ROOM_HEIGHT; y++) {
    for (let x = 0; x < ROOM_WIDTH; x++) {
      if (terrain.get(x,y) == TERRAIN_MASK_WALL) {
        continue;
      }

      let towerDamage = towerDamageAtPosition(new RoomPosition(x, y, roomName));
      map.set(x, y, towerDamage / 30);
    }
  }

  let activeTowers = getNumActiveTowers(roomName);
  let expiry = Game.time + 1000;

  towerDamageMaps[roomName] = {map,expiry,activeTowers};
}

function getTowerDamageMap(roomName) {
  if (!towerDamageMaps[roomName] ||
      towerDamageMaps[roomName].expiry < Game.time ||
      towerDamageMaps[roomName].activeTowers != getNumActiveTowers(roomName)) {
    createTowerDamageMap(roomName);
  }

  return towerDamageMaps[roomName].map;
}

Object.defineProperty(Room.prototype, 'towerDamageMap', {
  get: function() {
    if (this._towerDamageMap) {
      return this._towerDamageMap;
    }

    return this._towerDamageMap = getTowerDamageMap(this.name);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

function drawTowerDamageMapImpl(roomName) {
  let t0 = Game.cpu.getUsed();
  let visual = new RoomVisual(roomName);
  let map = getTowerDamageMap(roomName);

  let opts = {font: 0.5};
  for (let y = 0; y < ROOM_HEIGHT; y++) {
    for (let x = 0; x < ROOM_WIDTH; x++) {
      let pos = new RoomPosition(x, y, roomName);
      if (pos.tileType != TILE_EXTERIOR) {
        continue;
      }
      let value = `${map.get(x, y) * 3}`;
      visual.text(value, x, y + 0.25, opts)
    }
  }
  let t1 = Game.cpu.getUsed();

  let results = new String('drawn in ' + (t1-t0) + ' CPUs.');
  return results;
}

Room.prototype.drawTowerDamageMap = function() {
  return drawTowerDamageMapImpl(this.name);
}

global.drawTowerDamageMap = function(roomName) {
  return drawTowerDamageMapImpl(roomName);
}

module.exports = {
  getTowerDamageMap,
};
