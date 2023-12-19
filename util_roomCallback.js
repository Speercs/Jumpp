'use strict';

const QUAD_SWAMP_COST = 5;

function applyBunkerLoaders(roomName, matrix) {
  let room = Game.rooms[roomName];
  if (!room ||
    room.baseType != 'bunker' ||
    !room.storage ||
    !room.terminal) {
    return false;
  }

  // Mark all four possible loader home positions. One of them is already
  // marked because it's the crane position, but that redundancy is harmless.
  matrix.set(room.storage.pos.x + 1, room.storage.pos.y + 1, 0xff);
  matrix.set(room.storage.pos.x + 1, room.storage.pos.y - 1, 0xff);
  matrix.set(room.storage.pos.x - 1, room.storage.pos.y + 1, 0xff);
  matrix.set(room.storage.pos.x - 1, room.storage.pos.y - 1, 0xff);
}

global.applySpawnBlockers = function(roomName, matrix) {
  return applySpawnBlockers(roomName, matrix);
}

// Bunker loader home positions, storage cranes, spawn cranes, and anything
// that's got 0 moves.
function applySpawnBlockers(roomName, matrix) {
  applyBunkerLoaders(roomName, matrix);
  applyCranes(roomName, matrix);
}

function applyCranes(roomName, matrix) {
  let room = Game.rooms[roomName];
  if (!room) return;

  _(room.ownedCreeps)
      .filter(c => c.memory.role == 'crane')
      .forEach(c => matrix.set(c.pos.x, c.pos.y, 0xff))
      .value();
}

function applyPortals(roomName, matrix) {
  if (Memory.rooms[roomName].portalPositions) {
    for (let i = 0; i < Memory.rooms[roomName].portalPositions.length; i++) {
      let pos = Memory.rooms[roomName].portalPositions[i];
      matrix.set(pos.x, pos.y, 0xff);
    }
    return true;
  }

  return false;
}

function applySkLairs(roomName, matrix) {
  let room = Game.rooms[roomName];
  if (!room) {
    return false;
  }

  _(room.keeperLairs)
      .map(l => l.pos.getAdjacentOpenTiles())
      .flatten()
      .forEach(p => matrix.set(p.x, p.y, 0xff))
      .value();

  return false;
}

function applyWithinDistance(matrix, pos, range) {
  let xi = Math.max(0, pos.x - range);
  let xf = Math.min(49, pos.x + range);
  let yi = Math.max(0, pos.y - range);
  let yf = Math.min(49, pos.y + range);

  for (let x = xi; x <= xf; x++) {
    for (let y = yi; y <= yf; y++) {
      matrix.set(x, y, 0xff);
    }
  }
}

function applyInvaderRamparts(roomName, matrix) {
  let room = Game.rooms[roomName];
  if (!room || !room.invaderCore) {
    return false;
  }

  _(room.ramparts)
      .filter(r => r.owner.username == 'Invader')
      .forEach(k => applyWithinDistance(matrix, k.pos, 1))
      .value();
}

function applyKeepers(roomName, matrix) {
  let room = Game.rooms[roomName];
  if (!room) {
    return false;
  }

  _(room.npcs)
      .filter(c => c.owner.username == 'Source Keeper')
      .forEach(k => applyWithinDistance(matrix, k.pos, 3))
      .value();

  return false;
}

global.applySessileCreeps = function(roomName, matrix) {
  return applySessileCreeps(roomName, matrix);
}

function applySessileCreeps(roomName, matrix) {
  let room = Game.rooms[roomName];
  if (!room) {
    return false;
  }
  
  if (room.cranePosition) {
    matrix.set(room.cranePosition.x, room.cranePosition.y, 0xff);
  }
  
  for (let key in room.sessileCreeps) {
    let pos = room.sessileCreeps[key].pos;
    matrix.set(pos.x, pos.y, 0xff);
  }
  
  return room.cranePosition || _.keys(room.sessileCreeps).length > 0
}

function roomCallbackBase(roomName, matrix) {
  let changes = false;
  
  changes = applySessileCreeps(roomName, matrix) || changes;
  changes = applyBunkerLoaders(roomName, matrix) || changes;
  
  return changes;
}

function roomCallbackHighway(roomName, matrix) {
  let changes = false;
  
  changes = applyPortals(roomName, matrix) || changes;
  
  return changes;
}

function roomCallbackMine(roomName, matrix) {
  return false;
}

function roomCallbackOutpost(roomName, matrix) {
  let changes = false;
  
  changes = applySessileCreeps(roomName, matrix) || changes;
  
  return changes;
}

function roomCallbackWilderness(roomName, matrix) {
  let changes = false;
  
  changes = applyPortals(roomName, matrix) || changes;
  
  return changes;
}

function defaultRoomCallback(roomName, matrix) {
  if (!Memory.rooms[roomName]) {
    return;
  }
  
  if (!matrix) {
    matrix = new PathFinder.CostMatrix();
  }

  let changes = false;
  
  switch (Memory.rooms[roomName].role) {
    case 'base':
      changes = roomCallbackBase(roomName, matrix);
      break;
    case 'highway':
      changes = roomCallbackHighway(roomName, matrix);
      break;
    case 'mine':
      changes = roomCallbackMine(roomName, matrix);
      break;
    case 'outpost':
      changes = roomCallbackOutpost(roomName, matrix);
      break;
    case 'skLair':
      break;
    case 'wilderness':
      changes = roomCallbackWilderness(roomName, matrix);
      break;
    default:
      break;
  }
  
  if (changes) {
    return matrix;
  }
}

function avoidKeepersCallback(roomName, matrix) {
  if (!matrix) {
    matrix = new PathFinder.CostMatrix();
  }
  defaultRoomCallback(roomName, matrix);

  let room = Game.rooms[roomName];
  if (!room || !room.keeperLairs.length) {
    return matrix;
  }

  applySkLairs(roomName, matrix);
  applyKeepers(roomName, matrix);
  applyInvaderRamparts(roomName, matrix);

  return matrix;
}

function avoidBunkersCallback(roomName, matrix) {
  defaultRoomCallback(roomName, matrix);

  let room = Game.rooms[roomName];
  if (!room) {
    return matrix;
  }

  applyInvaderRamparts(roomName, matrix);

  return matrix;
}

function avoidMyCreepsCallback(roomName) {
  let matrix = new PathFinder.CostMatrix();
  let room = Game.rooms[roomName];
  if (room) {
    _.forEach(room.myCreeps, c => matrix.set(c.pos.x, c.pos.y, 0xff));
  }
  return matrix;
}

function longhaulerRoundTripCallback(roomName) {
  let room = Game.rooms[roomName];
  if (!room) return;
  if (!Game._longhaulerMatrices) {
    Game._longhaulerMatrices = {};
  }

  if (Game._longhaulerMatrices[roomName]) {
    return Game._longhaulerMatrices[roomName];
  }

  let costs = new PathFinder.CostMatrix;

  room.find(FIND_STRUCTURES).forEach(function(struct) {
    if (struct.structureType != STRUCTURE_ROAD &&
        struct.structureType !== STRUCTURE_CONTAINER &&
        (struct.structureType !== STRUCTURE_RAMPART || !struct.my)) {
      // Can't walk through non-walkable buildings
      costs.set(struct.pos.x, struct.pos.y, 0xff);
    }

    if ([STRUCTURE_TERMINAL, STRUCTURE_STORAGE].includes(struct.structureType)) {
      for (let dir=1; dir <= 8; dir++) {
        let pos = struct.pos.oneStep(dir);
        if (costs.get(pos.x, pos.y) < 10) {
          costs.set(pos.x, pos.y, 10);
        }
      }
    }
  });

  Game._longhaulerMatrices[roomName] = costs;
  return costs;
}

let quadMaps = {};

function buildQuadMap(roomName) {
  let matrix = new PathFinder.CostMatrix;
  const terrain = new Room.Terrain(roomName);

  function maybeSetSwamp(x, y) {
    if (matrix.get(x, y) != 0xff) {
      matrix.set(x, y, QUAD_SWAMP_COST);
    }
  }

  // TODO: Structures!

  for (let y = 1; y < ROOM_HEIGHT; y++) {
    for (let x = 1; x < ROOM_WIDTH; x++) {
			switch(terrain.get(x, y)) {
				case TERRAIN_MASK_SWAMP:
          maybeSetSwamp(x, y);
          maybeSetSwamp(x-1, y);
          maybeSetSwamp(x, y-1);
          maybeSetSwamp(x-1, y-1);
					break;
				case TERRAIN_MASK_WALL:
					matrix.set(x, y, 0xff);
					matrix.set(x-1, y, 0xff);
					matrix.set(x, y-1, 0xff);
					matrix.set(x-1, y-1, 0xff);
					break;
        default:
          break;
      }
    }
  }
  return matrix;
}

function quadCallback(roomName) {
  if (quadMaps[roomName]) return quadMaps[roomName];

  return quadMaps[roomName] = buildQuadMap(roomName);
}

// Temp!
global.qc = function(roomName) {
  return quadCallback(roomName);
}

module.exports = {
  applySpawnBlockers,
  avoidMyCreepsCallback,
  avoidBunkersCallback,
  avoidKeepersCallback,
  defaultRoomCallback,
  longhaulerRoundTripCallback,
  quadCallback,
};