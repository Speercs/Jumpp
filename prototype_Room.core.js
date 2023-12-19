'use strict';

Object.defineProperty(Room.prototype, 'invaderContainers', {
  get: function() {
    if (this._invaderContainers) {
      return this._invaderContainers;
    } else {
      return this._invaderContainers = _.filter(this.containers, 'invader');
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'invaderRamparts', {
  get: function() {
    if (this._invaderRamparts) {
      return this._invaderRamparts;
    } else if (this.controller) {
      // shortcut -- rooms with controllers can't ever have invader ramparts.
      return this._invaderRamparts = [];
    } else {
      return this._invaderRamparts = _.filter(this.ramparts, 'invader');
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'invaders', {
  get: function() {
    if (this._invaders) {
      return this._invaders;
    } else {
      return this._invaders = _.filter(this.npcs, 'invader');
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'nakedInvaders', {
  get: function() {
    if (this._nakedInvaders) {
      return this._nakedInvaders;
    } else {
      return this._nakedInvaders = _.filter(this.invaders, 'naked');
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'nakedInvaderContainers', {
  get: function() {
    if (this._nakedInvaderContainers) {
      return this._nakedInvaderContainers;
    } else {
      return this._nakedInvaderContainers = _.filter(this.invaderContainers, 'naked');
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

let maps = {};

const oneAway = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
const MAP_LIFETIME_TICKS = 1000;

function generateMaps(room) {
  // Trigger siege map generation.
  room.siegeMap;

  let hittersMap = new PathFinder.CostMatrix();
  let shootersMap = new PathFinder.CostMatrix();

  _(room.invaderRamparts)
      .filter(r => r.pos.isWalkableForHostiles())
      .forEach(function(r) {
        _.forEach(oneAway, o => hittersMap.increment(r.pos.x + o[0], r.pos.y + o[1]));

        let xi = Math.max(0, r.pos.x - 3);
        let xf = Math.min(49, r.pos.x + 3);
        let yi = Math.max(0, r.pos.y - 3);
        let yf = Math.min(49, r.pos.y + 3);
        for (let y = yi; y <= yf; y++) {
          for (let x = xi; x <= xf; x++) {
            shootersMap.increment(x, y);
          }
        }
      })
      .value();

  let expiry = Game.time + MAP_LIFETIME_TICKS;

  maps[room.name] = {hittersMap, shootersMap, expiry};
}

function checkMapsCache(room) {
  if (maps[room.name] && maps[room.name].expiry > Game.time) {
    return;
  }

  generateMaps(room);
}

Object.defineProperty(Room.prototype, 'strongholdExposureToDefendingHittersMap', {
  get: function() {
    if (this._strongholdExposureToDefendingHittersMap) {
      return this._strongholdExposureToDefendingHittersMap;
    }

    checkMapsCache(this);

    return this._strongholdExposureToDefendingHittersMap =
        maps[this.name] && maps[this.name].hittersMap;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

function getStrongholdShootersMap(roomName) {
  let room = Game.rooms[roomName];
  if (room) {
    return room.strongholdExposureToDefendingShootersMap;
  }

  return maps[roomName] && maps[roomName].shootersMap;
}

Object.defineProperty(Room.prototype, 'strongholdExposureToDefendingShootersMap', {
  get: function() {
    if (this._strongholdExposureToDefendingShootersMap) {
      return this._strongholdExposureToDefendingShootersMap;
    }

    checkMapsCache(this);

    return this._strongholdExposureToDefendingShootersMap =
        maps[this.name] && maps[this.name].shootersMap;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

function getStrongholdHittersMap(roomName) {
  let room = Game.rooms[roomName];
  if (room) {
    return room.strongholdExposureToDefendingHittersMap;
  }

  return maps[roomName] && maps[roomName].hittersMap;
}

function drawMapValues(roomName, map) {
  let visual = new RoomVisual(roomName);

  let opts = {font: 0.5};
  for (let y = 0; y < ROOM_HEIGHT; y++) {
    for (let x = 0; x < ROOM_WIDTH; x++) {
      let pos = new RoomPosition(x, y, roomName);
      if (pos.tileType != TILE_EXTERIOR) {
        continue;
      }
      let value = `${map.get(x, y)}`;
      visual.text(value, x, y + 0.25, opts)
    }
  }
}

function drawStrongholdHittersMap(roomName) {
  let map = getStrongholdHittersMap(roomName);
  if (!(map instanceof PathFinder.CostMatrix)) {
    return ERR_FAILED_PRECONDITION;
  }

  drawMapValues(roomName, map);

  return OK;
}

global.drawStrongholdHittersMap = function(roomName) {
  return drawStrongholdHittersMap(roomName);
}

Room.prototype.drawStrongholdHittersMap = function() {
  return drawStrongholdHittersMap(this.name);
}

function drawStrongholdShootersMap(roomName) {
  let map = getStrongholdShootersMap(roomName);
  if (!(map instanceof PathFinder.CostMatrix)) {
    return ERR_FAILED_PRECONDITION;
  }

  drawMapValues(roomName, map);

  return OK;
}

global.drawStrongholdShootersMap = function(roomName) {
  return drawStrongholdShootersMap(roomName);
}

Room.prototype.drawStrongholdShootersMap = function() {
  return drawStrongholdShootersMap(this.name);
}

Object.defineProperty(Room.prototype, 'strongholdHitters', {
  get: function() {
    if (this._strongholdHitters) {
      return this._strongholdHitters;
    } else {
      return this._strongholdHitters = _.filter(this.invaders, c => c.hasParts(ATTACK));
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'strongholdShooters', {
  get: function() {
    if (this._strongholdShooters) {
      return this._strongholdShooters;
    } else {
      return this._strongholdShooters = _.filter(this.invaders, c => c.hasParts(RANGED_ATTACK));
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'invaderCoreRuin', {
  get: function() {
    if (this._invaderCoreRuin) {
      return this._invaderCoreRuin;
    }

    let ruins =
        this.find(FIND_RUINS, {filter: r => r.structure.structureType == STRUCTURE_INVADER_CORE});

    if (ruins.length) {
      return ruins[0];
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Room.prototype.strongholdDamageAtPosition = function(x, y) {
  let pos = this.getPositionAt(x, y);

  let towerDamage = towerDamageAtPosition(pos);

  let numHitters = this.strongholdHitters.length;
  let hitterDamage = 0;
  if (numHitters) {
    hitterDamage = Math.min(numHitters, this.strongholdExposureToDefendingHittersMap.get(x, y)) *
        _.max(this.strongholdHitters, 'attackPower').attackPower;
  }

  let numShooters = this.strongholdShooters.length;
  let shooterDamage = 0;
  if (numShooters) {
    shooterDamage = Math.min(numShooters, this.strongholdExposureToDefendingShootersMap.get(x, y)) *
        Math.max(this.strongholdShooters, 'shootPower');
  }

  let keepersWithinThree = pos.findInRange(this.npcs, 3, {
    filter: c => c.owner.username == 'Source Keeper'
  });
  let keepersWithinOne = pos.findInRange(keepersWithinThree, 1);

  let keeperDamage =
      _.sum(keepersWithinThree, 'shootPower') + _.sum(keepersWithinOne, 'attackPower');

  return towerDamage + hitterDamage + shooterDamage + keeperDamage;
}

let damageToleranceMaps = {};
