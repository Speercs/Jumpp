'use strict';

let cranePositions           = {};
let cranePositionExpirations = {};

const CACHE_TIMEOUT = 500;
const CACHE_OFFSET  = 4;

function getCacheExpiration(){
  return CACHE_TIMEOUT + Math.round((Math.random()*CACHE_OFFSET*2)-CACHE_OFFSET);
}

function getCranePosition(room) {
  if (room.baseType == 'bunker' && room.memory.orientation) {
    let result = room.bunkerCenter.oneStep(room.memory.orientation);
    return result;
  }

  if (!room.storage || !room.storageLink) {
    return;
  }

  // Look for a manual override
  if (room.memory.cranePosition) {
    let derivedPos = deriveCranePosition(room);
    let overridePos = room.getPositionAt(
        room.memory.cranePosition.x,
        room.memory.cranePosition.y);
    if (derivedPos && derivedPos.isEqualTo(overridePos)) {
      room.logError(`I have an unnecessary cranePosition. Deleting.`)
      delete room.memory.cranePosition;
    }
    return overridePos;
  }

  return deriveCranePosition(room);
}

function deriveCranePosition(room) {
  // Look for valid crane positions. Neglect the possibility of walls.
  let minX = Math.max(room.storage.pos.x, room.storageLink.pos.x);
  let maxX = Math.min(room.storage.pos.x, room.storageLink.pos.x);
  let minY = Math.max(room.storage.pos.y, room.storageLink.pos.y);
  let maxY = Math.min(room.storage.pos.y, room.storageLink.pos.y);
  
  if (room.terminal && !room.terminal.pos.inRangeTo(room.controller.pos, 3)) {
    minX = Math.max(minX, room.terminal.pos.x);
    maxX = Math.min(maxX, room.terminal.pos.x);
    minY = Math.max(minY, room.terminal.pos.y);
    maxY = Math.min(maxY, room.terminal.pos.y);
  }

  if (room.baseType == 'lw' && room.mineralContainer) {
    minX = Math.max(minX, room.mineralContainer.pos.x);
    maxX = Math.min(maxX, room.mineralContainer.pos.x);
    minY = Math.max(minY, room.mineralContainer.pos.y);
    maxY = Math.min(maxY, room.mineralContainer.pos.y);
  }
  
  minX -= 1;
  maxX += 1;
  minY -= 1;
  maxY += 1;

  if (minX > maxX || minY > maxY) {
    room.logError('No possible crane position.');
    return;
  }
  
  // If there's more than one option, choose the one that can reach more
  // extensions and towers.
  let options = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      options.push({
          x: x,
          y: y,
          extensions: room.getPositionAt(x, y).findInRange(room.extensions, 1).length +
              room.getPositionAt(x, y).findInRange(room.towers, 1).length,
      });
    }
  }

  let best = _.omit(_.max(options, 'extensions'), 'extensions');
  
  return room.getPositionAt(best.x, best.y);
}

function checkCranePositionCache(room) {
  // if cache is expired or doesn't exist
  if (!cranePositionExpirations[room.name] ||
      !cranePositions[room.name] ||
      cranePositionExpirations[room.name] < Game.time) {
    cranePositionExpirations[room.name] = Game.time + getCacheExpiration();
    cranePositions[room.name] = getCranePosition(room);
  }
}

Object.defineProperty(Room.prototype, 'cranePosition', {
  get: function() {
    checkCranePositionCache(this);
    if (this._cranePosition) {
      return this._cranePosition;
    } else {
      return this._cranePosition = cranePositions[this.name];
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
