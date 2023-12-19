'use strict';


let Nav = require('util_nav');
let NormalMap = require('prototype_Room.normalMap');
let TowerDamageMap = require('prototype_Room.towerDamageMap');

RoomPosition.prototype.blockedCreep = function() {
  return this.findInRange(FIND_MY_CREEPS, 1, {
    filter: c => c.nextPos && this.isEqualTo(c.nextPos)
  })[0];
}

RoomPosition.prototype.findClosestInRange = function(stuff, range, options) {
  let stuffInRange = this.findInRange(stuff, range, options);
  return this.findClosestByRange(stuffInRange, options);
}

RoomPosition.prototype.findClosestTerminal = function(options = {}) {
  let thisPos = this;
  let bestCost;
  
  // Start with a rough sort by room linear distance to put the likeliest
  // destinations first. Use the current shortest path as a maxPath in
  // the PathFinder.search so that we don't waste a lot of time working out
  // the details of paths that aren't gonna win.
  let terminals = _(Game.terminalBases)
      .filter(b => b.controller.level >= (options.minRCL || 0) &&
          b.labs.length >= (options.minLabs || 0))
      .sortBy(function(t) {return Game.map.getRoomLinearDistance(thisPos.roomName, t.name)})
      .map(function(r) {
          let t = r.activeTerminal;
          let result = PathFinder.search(
              thisPos,
              [{pos: t.pos, range:1}],
              {maxCost: bestCost, maxOps: 10000});
          if (!result.incomplete) {
            bestCost = result.cost;
            return {terminal: t, cost: result.cost, path:result.path};
          }
      })
      .value();

  let nearest = _.min(terminals, 'cost');

  if (options.returnData) {
    options.returnData.cost = nearest.cost;
    options.returnData.path = nearest.path;
  }
  return nearest.terminal;
}

RoomPosition.prototype.getAdjacentOpenTiles = function() {
  let possibles = [];

  for (let dir = 1; dir <= 8; dir++) {
    possibles.push(this.oneStep(dir));
  }

  return _.filter(possibles, 'open');
}

RoomPosition.prototype.getAdjacentWalkableTiles = function() {
  let possibles = [];

  for (let dir = 1; dir <= 8; dir++) {
    possibles.push(this.oneStep(dir));
  }

  return _.filter(possibles, p => p.open && p.isWalkable());
}

RoomPosition.prototype.getCartesianDistance = function(target) {
  if (!target) {
    return ERR_INVALID_ARGS;
  }
  let pos = target.pos || target;

  let dx = this.x - pos.x;
  let dy = this.y - pos.y;

  return Math.sqrt(dx*dx + dy*dy);
}

RoomPosition.prototype.getCartesianDistanceSquared = function(target) {
  if (!target) {
    return ERR_INVALID_ARGS;
  }
  let pos = target.pos || target;

  let dx = this.x - pos.x;
  let dy = this.y - pos.y;

  return dx*dx + dy*dy;
}

/**
 * Returns linear direction to specified position if it lies precisely in that direction. Otherwise
 * returns 0.
 */
RoomPosition.prototype.getExactDirectionTo = function(...args) {
  let pos;
  if (args.length == 1) {
    if (args[0].pos) {
      pos = args[0].pos;
    } else {
      pos = args[0];
    }
  } else if (args.length == 2) {
    pos = new RoomPosition(args[0], args[1], this.roomName);
  } else {
    return ERR_INVALID_ARGS;
  }

  let src = this.getGlobalXY();
  let dest = pos.getGlobalXY();

  let dx = dest.x - src.x;
  let dy = dest.y - src.y;

  if (dx && dy && Math.abs(dx) != Math.abs(dy)) {
    // Not perfect alignment.
    return 0;
  }

  return this.getDirectionTo(pos);
}

RoomPosition.prototype.getPositionsAtDistance = function(distance) {
  let result = [];

  let side = distance * 2;
  let roomName = this.roomName;
  let xmin = this.x - distance;
  let xmax = this.x + distance;
  let ymin = this.y - distance;
  let ymax = this.y + distance;

  for (let step = 0; step < side; step++) {
    result.push(new RoomPosition(xmin + step, ymin, roomName ));
    result.push(new RoomPosition(xmax, ymin + step, roomName ));
    result.push(new RoomPosition(xmax - step, ymax, roomName ));
    result.push(new RoomPosition(xmin, ymax - step, roomName ));
  }

  return _.compact(result);
}

RoomPosition.prototype.getGlobalRangeTo = function(tgt) {
  let a = this.getGlobalXY();
  let b = tgt.getGlobalXY();

  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

RoomPosition.prototype.getGlobalXY = function() {
  let roomXy = Nav.roomNameToXY(this.roomName);
  return {x: roomXy[0] * 49 + this.x, y: roomXy[1] * 49 + this.y};
}

Object.defineProperty(RoomPosition.prototype, 'isBunkerTile', {
  get: function() {
    if (this._isBunkerTile) {
      return this._isBunkerTile;
    }

    let room = Game.rooms[this.roomName];

    return room && (room.baseType == 'bunker') && (room.bunkerDistance(this) < 7);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(RoomPosition.prototype, 'link', {
  get: function() {
    return '[room ' +
      `<a href = '${roomURL(this.roomName)}'>${this.roomName}</a>`
      + ' pos ' + this.x + ',' + this.y + ']';
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(RoomPosition.prototype, 'open', {
  get: function() {
    const terrain = new Room.Terrain(this.roomName);
    return terrain.get(this.x, this.y) != TERRAIN_MASK_WALL;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(RoomPosition.prototype, 'nearEdge', {
  get: function() {
    if (this.x > 1 && this.x < 48 && this.y > 1 && this.y < 48) {
      return false;
    }

    let room = Game.rooms[this.roomName];

    if (!room) {
      return true;
    }

    return this.findInRange(FIND_EXIT,1).length > 0;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(RoomPosition.prototype, 'onEdge', {
  get: function() {return this.x == 0 || this.x == 49 || this.y == 0 || this.y == 49;},
  set: function(){},
  enumerable: false,
  configurable: true,
});

RoomPosition.prototype.oneStep = function(direction) {
  let x = this.x + [0,0,1,1,1,0,-1,-1,-1][direction];
  let y = this.y + [0,-1,-1,0,1,1,1,0,-1][direction];

  let xy = Nav.roomNameToXY(this.roomName);

  if (y <= 0) {
    xy[1] -= 1;
    if (y < 0) {
      x = this.x;
    }
    y = 49;
  } else if (y >= 49) {
    xy[1] += 1;
    if (y > 49) {
      x = this.x;
    }
    y = 0;
  } else if (x <= 0) {
    xy[0] -= 1;
    if (x < 0) {
      y = this.y;
    }
    x = 49;
  } else if (x >= 49) {
    xy[0] += 1;
    if (x > 49) {
      y = this.y;
    }
    x = 0;
  }
  let roomName = Nav.getRoomNameFromXY(xy[0], xy[1]);
  
  return new RoomPosition(x, y, roomName);
}

RoomPosition.prototype.isSafe = function(matrix) {
  let room = Game.rooms[this.roomName];
  
  if (!room || !room.controller || !room.controller.my) {
    return false;
  }
  
  if (room.alertCondition != ALERT_CONDITION_RED && !room.memory.fakeRedAlert) {
    return true;
  }

  let tile = room.siegeMap.get(this.x, this.y);
  if (tile == TILE_EXTERIOR || tile == TILE_EXPOSED) {
    return false;
  }
  
  return true;
}

RoomPosition.prototype.weakestCriticalWallInRange = function(range) {
  let room = Game.rooms[this.roomName];
  let wallsInRange = this.findInRange(room.criticalWalls, range);
  return _.min(wallsInRange, room.nukes.length ? 'effectiveHits' : 'hits');
}

/**
 * Out of the ramparts within range of this position which are below their absolute max
 * hits, return the one with the lowest scaledHits.
 */
RoomPosition.prototype.weakestScaledRampartInRange = function(range) {
  let room = Game.rooms[this.roomName];
  let wallsInRange = this.findInRange(room.ramparts, range);
  let repairable = _.filter(wallsInRange, w => w.hits < w.hitsMax);
  return _.min(repairable, room.nukes.length ? 'scaledHits' : 'simpleScaledHits');
}

Object.defineProperty(RoomPosition.prototype, 'approachPoint', {
  get: function() {
    let normal = this.normal;

    if (!normal) {
      return;
    }

    let x = this.x + APPROACH_POINT_DISTANCE * [0,0,1,1,1,0,-1,-1,-1][normal];
    let y = this.y + APPROACH_POINT_DISTANCE * [0,-1,-1,0,1,1,1,0,-1][normal];

    if (x < 1 || x > 48 || y < 1 || y > 48) {
      return;
    }

    return new RoomPosition(x, y, this.roomName);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(RoomPosition.prototype, 'normal', {
  get: function() {
    let normalMap = NormalMap.getNormalMap(this.roomName);
    if (!normalMap) {
      return 0;
    }
    return normalMap.get(this.x, this.y);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(RoomPosition.prototype, 'tileType', {
  get: function() {
    let siegeMap = getSiegeMap(this.roomName);
    if (!siegeMap) {
      return TILE_UNKNOWN;
    }
    return siegeMap.get(this.x, this.y);
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(RoomPosition.prototype, 'towerDamage', {
  get: function() {
    // Trust the map if it exists. Otherwise try the old way.
    let towerDamageMap = TowerDamageMap.getTowerDamageMap(this.roomName);
    if (!towerDamageMap) {
      return towerDamageAtPosition(this);
    }

    return towerDamageMap.get(this.x, this.y) * 30;
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

RoomPosition.prototype.hasConstructionSite = function() {
  let stuffHere = this.lookFor(LOOK_CONSTRUCTION_SITES);
  return stuffHere.length > 0;
}

RoomPosition.prototype.creep = function() {
  return this.lookFor(LOOK_CREEPS)[0];
}

RoomPosition.prototype.hasCreep = function() {
  let stuffHere = this.lookFor(LOOK_CREEPS);
  return stuffHere.length > 0;
}

RoomPosition.prototype.rampart = function() {
  let stuffHere = this.lookFor(LOOK_STRUCTURES);
  return _.find(stuffHere, s => s.structureType == STRUCTURE_RAMPART);
}

RoomPosition.prototype.hasRampart = function() {
  return !!this.rampart();
}

RoomPosition.prototype.hasRoad = function() {
  let stuffHere = this.lookFor(LOOK_STRUCTURES);
  return _.any(stuffHere, s => s.structureType == STRUCTURE_ROAD);
}

RoomPosition.prototype.isWalkable = function() {
  let structures = this.lookFor(LOOK_STRUCTURES);
  if (_.any(structures, s => OBSTACLE_OBJECT_TYPES.includes(s.structureType))) {
    return false;
  }

  return !_.any(structures, s => s.structureType == STRUCTURE_RAMPART && !s.my);
}

RoomPosition.prototype.isWalkableForHostiles = function() {
  let structures = this.lookFor(LOOK_STRUCTURES);
  return !_.any(structures, s => OBSTACLE_OBJECT_TYPES.includes(s.structureType));
}

RoomPosition.prototype.isWalkableBunkerPerimeter = function() {
  let room = Game.rooms[this.roomName];
  if (!room || !room.isMyBase || !room.bunkerCenter) return false;

  if (this.tileType != TILE_CRITICAL_WALL) return false;

  let chebyshev = this.getRangeTo(room.bunkerCenter);
  if (chebyshev > 6 || chebyshev < 5) return false;

  let manhattan = Math.abs(this.x - room.bunkerCenter.x) +
      Math.abs(this.y - room.bunkerCenter.y);

  if (chebyshev == 5 && manhattan != 10) return false;

  if (!this.isWalkable()) return false;

  return true;
}

global.drawWalkableBunkerPerimeter = function(room) {
	let visual = new RoomVisual(room.name);

	for (let y = 0; y < ROOM_HEIGHT; y++) {
		for (let x = 0; x < ROOM_WIDTH; x++) {
      if (room.getPositionAt(x, y).isWalkableBunkerPerimeter()) {
        visual.rect(x-0.5, y-0.5, 1, 1, {fill:'blue'});
      }
		}
	}
	return OK;
}

RoomPosition.prototype.needsTankTrap = function() {
  let room = Game.rooms[this.roomName];
  if (!room || !room.isMyBase || !room.bunkerCenter) return false;

  let chebyshev = this.getRangeTo(room.bunkerCenter);
  if (chebyshev > 8 || chebyshev < 6) return false;

  let manhattan = Math.abs(this.x - room.bunkerCenter.x) +
      Math.abs(this.y - room.bunkerCenter.y);
  if (manhattan % 2) return false;

  if (chebyshev == 6 && manhattan != 12) return false;

  if (chebyshev == 8 && manhattan == 16) return false;

  if (this.tileType != TILE_EXTERIOR) return false;

  let structures = this.findInRange(FIND_STRUCTURES, 0);
  if (structures.length) return false;

  let exits = this.findInRange(FIND_EXIT, 1);
  if (exits.length) return false;

  if (_(room.memory.digsites)
      .map(d => room.getPositionAt(d.diggerPosition.x, d.diggerPosition.y))
      .find(p => this.isEqualTo(p))) {
    return false;
  }

  return true;
}

global.drawTankTraps = function(room) {
	let visual = new RoomVisual(room.name);

	for (let y = 0; y < ROOM_HEIGHT; y++) {
		for (let x = 0; x < ROOM_WIDTH; x++) {
      if (room.getPositionAt(x, y).needsTankTrap()) {
        visual.rect(x-0.5, y-0.5, 1, 1, {fill:'yellow'});
      }
		}
	}
	return OK;
}
