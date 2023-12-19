'use strict';

let Nav = require('util_nav');

let normalMaps = {};

function getNearbyCriticalWallDirections(x, y, roomName) {
  let directions = [1,2,3,4,5,6,7,8];
  let pos = new RoomPosition(x, y, roomName);

  return _.filter(directions, d => pos.oneStep(d).tileType == TILE_CRITICAL_WALL);
}

function getRawNormal(x, y, roomName) {
  let nearbyCriticals = getNearbyCriticalWallDirections(x, y, roomName);

  if (!nearbyCriticals.length) {
    return 0;
  }

  if (nearbyCriticals.length == 1) {
    return Nav.oppositeDirection(nearbyCriticals[0]);
  }

  let nearbyCardinals = _.intersection(nearbyCriticals, [1, 3, 5, 7]);

  if (nearbyCardinals.length == 1) {
    return Nav.oppositeDirection(nearbyCardinals[0]);
  }

  return 0;
}

function getNormal(x, y, roomName) {
  // First get simple normal.
  let normal = getRawNormal(x, y, roomName);

  if (!normal) {
    return 0;
  }

  // Confirm that one can walk at least APPROACH_POINT_DISTANCE steps in that direction without
  // leaving the room or hitting a natural wall.
  let dx = global.dx(normal);
  let dy = global.dy(normal);

  let cursorx = x + APPROACH_POINT_DISTANCE * dx;
  let cursory = y + APPROACH_POINT_DISTANCE * dy;

  if (cursorx < 1 || cursorx > 48 || cursory < 1 || cursory > 48) {
    return 0;
  }

  let terrain = Game.map.getRoomTerrain(roomName);

  for (let i = 0; i < APPROACH_POINT_DISTANCE; i++) {
    if (terrain.get(cursorx, cursory) == TERRAIN_MASK_WALL) {
      return 0;
    }
    cursorx -= dx;
    cursory -= dy;
  }

  return normal;
}

function createNormalMap(roomName) {
  let t0 = Game.cpu.getUsed();
  let terrain = Game.map.getRoomTerrain(roomName);
  normalMaps[roomName] = new PathFinder.CostMatrix;

  // quick out: If room has no spawns or towers, it's broken and normals don't matter.
  let room = Game.rooms[roomName];
  if (room && !room.spawns.length && !room.towers.length) return;

  for (let y = 0; y < ROOM_HEIGHT; y++) {
    for (let x = 0; x < ROOM_WIDTH; x++) {
      if (terrain.get(x,y) == TERRAIN_MASK_WALL) {
        continue;
      }

      let pos = new RoomPosition(x, y, roomName);
      if (pos.tileType != TILE_EXTERIOR) {
        continue;
      }

      let normal = getNormal(x, y, roomName);
      if (normal) {
        normalMaps[roomName].set(x, y, normal);
      }
    }
  }
  let t1 = Game.cpu.getUsed();
  console.log(`${roomName} normalMapTime = ${_.round(t1-t0, 4)}`);
}

function getNormalMap(roomName) {
  if (!normalMaps[roomName]) {
    createNormalMap(roomName);
  }
  return normalMaps[roomName];
}

Object.defineProperty(Room.prototype, 'normalMap', {
  get: function() {
    if (this._normalMap) {
      return this._normalMap;
    }

    return this._normalMap = getNormalMap(this.name);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

function drawNormalMapImpl(roomName) {
  let t0 = Game.cpu.getUsed();
  let visual = new RoomVisual(roomName);
  let map = getNormalMap(roomName);

  let opts = {font: 1.0};
  for (let y = 0; y < ROOM_HEIGHT; y++) {
    for (let x = 0; x < ROOM_WIDTH; x++) {
      let normal = map.get(x, y);

      if (!normal) {
        continue;
      }
      visual.text(ARROWS[normal], x, y + 0.5, opts);
      let point = new RoomPosition(x, y, roomName);
      let approachPoint = point.approachPoint;
      visual.line(point, approachPoint);
    }
  }
  let t1 = Game.cpu.getUsed();

  let results = new String('drawn in ' + (t1-t0) + ' CPUs.');
  return results;
}

Room.prototype.drawNormalMap = function() {
  return drawNormalMapImpl(this.name);
}

global.drawNormalMap = function(roomName) {
  if (!getSiegeMap(roomName)) {
    console.log(`No siege map exists for ${roomName}`);
    return;
  }
  return drawNormalMapImpl(roomName);
}

module.exports = {
  getNormalMap,
};
