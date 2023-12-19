'use strict';

let upgradePositions = {};

function checkCache(room) {
  if (upgradePositions[room.name]) {
    return;
  }

  if (room.memory.upgrade && room.memory.upgrade.pos) {
    upgradePositions[room.name] = _.map(
      room.memory.upgrade && room.memory.upgrade.pos,
      function(p) {
        return room.getPositionAt(p.x, p.y);
      });
    return;
  }

  upgradePositions[room.name] = deriveUpgradePositions(room);
}

global.deriveUpgradePositions = function(room) {
  return deriveUpgradePositions(room);
}

function deriveUpgradePositions(room) {
  if (room.upgradeContainer && !room.upgradeContainer.isSourceContainer) {
    return [room.upgradeContainer.pos];
  }

  if (room.terminal && room.terminal.servingController && room.boostloaderPos.length) {
    let positions = [];
    let dir = room.terminal.pos.getDirectionTo(room.boostloaderPos[0]);
    for (let i = 0; i < 7; i++) {
      dir = (dir % 8) + 1;
      positions.push(room.terminal.pos.oneStep(dir));
    }
    return positions;
  }

  if (room.storage && room.storage.servingController) {
    let positions = [];
    for (let dir = 0; dir < 8; dir++) {
      let pos = room.storage.pos.oneStep(dir);
      if (pos.getRangeTo(room.controller) <= 3) {
        positions.push(pos);
      }
    }

    if (positions.length) return positions;
  }

  if (room.upgradeLink) {
    // Find a spot that's within 1 of the upgradeLink and 3 of the controller.
    let xMin = room.controller.pos.x - 3;
    let xMax = room.controller.pos.x + 3;
    let yMin = room.controller.pos.y - 3;
    let yMax = room.controller.pos.y + 3;

    xMin = Math.max(xMin, room.upgradeLink.pos.x - 1);
    xMax = Math.min(xMax, room.upgradeLink.pos.x + 1);
    yMin = Math.max(yMin, room.upgradeLink.pos.y - 1);
    yMax = Math.min(yMax, room.upgradeLink.pos.y + 1);

    let possibles = [];

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        let pos = room.getPositionAt(x, y);
        if (pos.open &&
          pos.isWalkable()) {
          possibles.push(pos);
        }
      }
    }

    // If any positions have ramparts, trim those that lack ramparts.
    if (_.find(possibles, p => p.hasRampart())) {
      possibles = _.filter(possibles, p => p.hasRampart());
    }

    return possibles;
  }

  if (room.terminal && room.terminal.pos.getRangeTo(room.controller) <= 4) {
    let possibles = [];
    for (let i = 1; i <= 8; i++) {
      let pos = room.terminal.pos.oneStep(i);
      if (pos.getRangeTo(room.controller) <= 3 &&
          pos.isWalkable() &&
          pos != room.boostloaderPos &&
          !_.find(room.boostPos, p => p.isEqualTo(pos))) {
        possibles.push(pos);
      }
    }
    if (possibles.length) {
      return possibles;
    }
  }

  return [];
}


Object.defineProperty(Room.prototype, 'upgradePositions', {
  get: function() {
    checkCache(this);
    if (this._upgradePositions) {
      return this._upgradePositions;
    } else {
      return this._upgradePositions = upgradePositions[this.name];
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Room.prototype.clearUpgradePositionsCache = function() {
  delete upgradePositions[this.name];
}
