'use strict';

function update(room) {
  switch (room.memory.role) {
    case 'base':
      updateBase(room);
      break;
    case 'outpost':
      updateOutpost(room);
      break;
    default:
      room.logError(`Weird room role for autobuild: ${room.memory.role}`);
      break;
  }
}

function updateOutpost(room) {
  let numConstructionSites = room.constructionSites.length;

  // Spawn
  if (room.controller.level > 0 && !room.spawns.length && !numConstructionSites) {
    let pos = outpostSpawnSite(room);
    let name = outpostSpawnName(room);
    room.logError('I should build spawn ' + name + ' at ' + pos.link);
    room.createConstructionSite(pos.x, pos.y, STRUCTURE_SPAWN, name);
    return;
  }

  // Extensions
  let desiredExtensions = [0, 0, 3, 7, 7, 7, 7, 7, 7][room.controller.level];
  if (room.extensions.length < desiredExtensions && room.spawns && !numConstructionSites) {
    let pos = nextOutpostExtensionSite(room);
    room.logError('I should build an extension at ' + pos.link);
    room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION);
  }
}

function outpostSpawnSite(room) {
  let openTiles = _.filter(room.controller.pos.getPositionsAtDistance(2), 'open');

  let sources = room.find(FIND_SOURCES);

  function fitness(pos) {
    let numAdjacentOpenTiles = pos.getAdjacentOpenTiles().length;

    let stepsToSources = _.sum(
        sources,
        source => PathFinder.search(pos, {pos: source.pos, range:2}).path.length);
  
    return numAdjacentOpenTiles * 1000 - stepsToSources;
  }

  return best = _.max(openTiles, fitness);
}

function outpostSpawnName(room) {
  return 'Outpost' + room.name;
}

function nextOutpostExtensionSite(room) {
  let terrain = room.getTerrain();
  let sources = room.find(FIND_SOURCES);
  let spawn = room.spawns[0];

  if (!spawn) {
    return {x: -1, y: -1};
  }

  function tileFitness(x, y) {
    if (terrain.get(x,y) == TERRAIN_MASK_WALL) {
      return Infinity;
    }

    let pos = room.getPositionAt(x, y);

    let nearestSource = pos.findClosestByRange(sources);
    let distToNearestSource = pos.getRangeTo(nearestSource);

    if (distToNearestSource < 3) {
      return Infinity;
    }

    let nearestExtension = pos.findClosestByRange(room.extensions);
    let distToNearestExtension = pos.getRangeTo(nearestExtension);

    if (distToNearestExtension < 2) {
      return Infinity;
    }

    let distToSpawn = pos.getRangeTo(room.spawns[0]);

    if (distToSpawn < 4) {
      return Infinity;
    }

    return distToNearestSource * distToNearestSource + distToSpawn * distToSpawn;
  }

  let bestPos = {};
  let bestValue = Infinity;

  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      let value = tileFitness(x, y);

      if (value < bestValue) {
        bestValue = value;
        bestPos = {x, y};
      }
    }
  }

  return room.getPositionAt(bestPos.x, bestPos.y);
}

function updateBase(room) {
  if (room.baseType != 'bunker' || room.memory.shutdown || ticksSinceReset() < 25) {
    return;
  }

  let lastAutobuild = room.getLast('autobuild');
  if (lastAutobuild > Game.time - 100 &&
      lastAutobuild > (room.memory._lastConstructTime || 0) &&
      lastAutobuild > (room.memory._lastDestructTime || 0) &&
      (room.controller.level == 8 && lastAutobuild > (room.memory._lastLevelChange || 0)) &&
      lastAutobuild > (room.memory._lastRampartTo100k || 0)) {
    return;
  }

  room.setLast('autobuild', Game.time);
  
  let roomLevel = room.controller.level;
  let weakRampart = room.lowRamparts.length > 0;
  let weakCriticalRampart = room.weakestCriticalWall && room.weakestCriticalWall.hits < 1000000;
  let nakedSpawns = _.filter(room.spawns, s => s.naked && s.my);
  let nakedTowers = _.filter(room.towers, s => s.naked && s.my);
  let nakedLabs = _.filter(room.labs, s => s.naked && s.my);
  let numConstructionSites = room.constructionSites.length;
  let numRampartConstructionSites = _.filter(
      room.constructionSites, s => s.structureType == STRUCTURE_RAMPART).length;
  let numSpawnConstructionSites = room.maxSpawns - room.spawns.length && _.filter(
      room.constructionSites, s => s.structureType == STRUCTURE_SPAWN).length;
  let nakedWalkableTilesNearController = room.nakedWalkableTilesNearController();
  // It's not a bug that safemode is in there twice. The first one is an early-out, since being
  // not in safemode is the dominant case.
  let initialSafemodeTicksRemaining =
      (room.controller.safemode &&
        !room.controller.safeModeCooldown &&
        room.controller.safemode
      ) || 0;

  // Spawn Rampart
  if (roomLevel > 1 &&
      !numRampartConstructionSites &&
      !weakRampart &&
      nakedSpawns.length &&
      initialSafemodeTicksRemaining < 5000) {
    room.logDebug('I should build a spawn rampart');
    let pos = nakedSpawns[0].pos;
    room.logDebug('I should build a spawn rampart at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_RAMPART);
    return;
  }
  
  // Spawn Site Rampart
  const MAX_SPAWNS = 3;
  if (!weakRampart && !numConstructionSites && room.spawns.length < MAX_SPAWNS) {
    let pos = nextSpawnSite(room);
    if (pos && pos.tileType == TILE_INTERIOR) {
      room.logDebug('I should build a spawn site rampart at ' + pos.link);
      room.createConstructionSite(pos, STRUCTURE_RAMPART);
      return;
    }
  }
  
  // Spawn
  if (!numSpawnConstructionSites && roomLevel > 1 && room.maxSpawns > room.spawns.length) {
    let pos = nextSpawnSite(room);
    let name = nextSpawnName(room);
    room.logDebug('I should build spawn ' + name + ' at ' + pos.link);
    room.createConstructionSite(pos.x, pos.y, STRUCTURE_SPAWN, name);
    return;
  }
  
  // Tower Rampart
  if (roomLevel > 1 &&
      !numRampartConstructionSites &&
      !weakRampart &&
      nakedTowers.length &&
      initialSafemodeTicksRemaining < 5000) {
    room.logDebug('I should build a tower rampart');
    let pos = nakedTowers[0].pos;
    room.logDebug('I should build a tower rampart at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_RAMPART);
    return;
  }
  
  // Tower Site Rampart
  const MAX_TOWERS = 6;
  if (!weakRampart && !numConstructionSites && (room.towers.length || 0) < MAX_TOWERS) {
    let pos = nextTowerPos(room);
    if (pos && pos.tileType == TILE_INTERIOR) {
      room.logDebug('I should build a tower site rampart at ' + pos.link);
      room.createConstructionSite(pos, STRUCTURE_RAMPART);
      return;
    }
  }
  
  // Tower
  if (!weakRampart && !numConstructionSites && room.maxTowers > room.towers.length) {
    let pos = nextTowerPos(room);
    room.logDebug('I should build a tower at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_TOWER);
    return;
  }
  
  // Storage Rampart
  if (roomLevel > 2 &&
      !numConstructionSites &&
      !weakRampart &&
      room.bunkerCenter.tileType != TILE_STUB &&
      room.bunkerCenter.tileType != TILE_KEEP &&
      room.bunkerCenter.tileType != TILE_GALLERY &&
      room.bunkerCenter.tileType != TILE_CRITICAL_WALL &&
      initialSafemodeTicksRemaining < 5000) {
    room.logDebug('I should build a storage rampart');
    let pos = room.bunkerCenter;
    room.logDebug('I should build a storage rampart at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_RAMPART);
    return;
  }
  
  // Storage
  if (roomLevel > 3 &&
      !numConstructionSites &&
      !weakRampart &&
      !room.storage) {
    room.logDebug('I should build a storage');
    let pos = room.bunkerCenter;
    room.logDebug('I should build a storage at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_STORAGE);
    return;
  }

  // Controller rampart
  if (roomLevel > 1 &&
      !numConstructionSites &&
      !weakRampart &&
      nakedWalkableTilesNearController.length &&
      initialSafemodeTicksRemaining < 5000) {
    room.logDebug(`I should build a controller rampart`);
    let pos = nakedWalkableTilesNearController[0];
    room.logDebug(`I should build a controller rampart at ${pos.link}`);
    room.createConstructionSite(pos, STRUCTURE_RAMPART);
    return;
  }
  
  // Extension
  if (!weakRampart &&
      !numConstructionSites &&
      room.maxExtensions > room.extensions.length) {
    let pos = nextExtensionPos(room);
    room.logDebug('I should build an extension at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_EXTENSION);
    return;
  }
  
  // Exterior Ramparts
  if (!weakRampart &&
      !numConstructionSites &&
      !weakCriticalRampart &&
      roomLevel > 4 &&
      // If the outer wall is complete, the center tile will be INTERIOR or KEEP.
      room.bunkerCenter.tileType != TILE_KEEP &&
      room.bunkerCenter.tileType != TILE_INTERIOR) {
    let pos = nextExteriorRampartPos(room);
    room.logDebug('I should add a tile to the exterior rampart at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_RAMPART);
    return;
  }
  
  // Terminal rampart
  if (!weakRampart &&
      !numConstructionSites &&
      room.terminal &&
      room.terminal.my &&
      room.terminal.naked) {
    let pos = room.terminal.pos;
    room.logDebug('I should build a terminal rampart at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_RAMPART);
    return;
  }
  
  // Terminal
  if (roomLevel > 5 &&
      !numConstructionSites &&
      !weakRampart &&
      !room.terminal) {
    let pos = terminalPos(room);
    room.logDebug('I should build a terminal at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_TERMINAL);
    return;
  }
  
  // Storage link
  if (roomLevel > 4 &&
      !weakRampart &&
      !numConstructionSites &&
      !room.storageLink) {
    let pos = storageLinkPos(room);
    room.logDebug('I should build a storageLink at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_LINK);
    return;
  }

  // Lab Rampart
  if (roomLevel > 5 && !numConstructionSites && !weakRampart && nakedLabs.length) {
    //room.logError('I should build a lab rampart');
    let pos = nakedLabs[0].pos;
    room.logDebug('I should build a lab rampart at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_RAMPART);
    return;
  }
  
  // Lab Site Rampart
  const MAX_LABS = 10;
  if (!weakRampart &&
      !numConstructionSites &&
      roomLevel > 5 &&
      room.labs.length < MAX_LABS) {
    let pos = nextLabPos(room);
    if (pos && (pos.tileType == TILE_INTERIOR || pos.tileType == TILE_EXPOSED)) {
      room.logDebug('I should build a lab site rampart at ' + pos.link);
      room.createConstructionSite(pos, STRUCTURE_RAMPART);
      return;
    }
  }

  // Lab
  if (!weakRampart &&
      !numConstructionSites &&
      room.terminal &&
      !room.terminal.servingController &&
      room.maxLabs > room.labs.length) {
    let pos = nextLabPos(room);
    room.logDebug('I should build a lab at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_LAB);
    return;
  }
  
  // Exposed Rampart
  if (roomLevel > 5 &&
      !numConstructionSites &&
      !weakRampart &&
      !weakCriticalRampart &&
      room.exposedBunkerTiles.length) {
    let pos = nextExposedRampart(room);
    room.logDebug('I should build a rampart on the exposed tile at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_RAMPART);
    return;
  }
  
  // Interior Rampart
  if (roomLevel > 6 &&
      !numConstructionSites &&
      !weakRampart &&
      !weakCriticalRampart &&
      room.interiorBunkerTiles.length) {
    let pos = nextInteriorRampart(room);
    room.logDebug('I should build a rampart on the interior tile at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_RAMPART);
    return;
  }

  // Factory
  if (!room.factory &&
      roomLevel > 6 &&
      !numConstructionSites &&
      !weakRampart &&
      room.storage &&
      room.terminal &&
      !room.terminal.servingController &&
      !room.memory.preShutdown) {
    let pos = factoryPos(room);
    room.logDebug('I should build a factory at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_FACTORY);
    return;
  }

  // Observer
  if (roomLevel > 7 && !numConstructionSites && !weakRampart && !room.observer) {
    let pos = observerPos(room);
    room.logDebug('I should build an Observer at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_OBSERVER);
    return;
  }
  
  // Power Spawn
  if (roomLevel > 7 && !numConstructionSites && !weakRampart && !room.powerSpawn) {
    let pos = powerSpawnPos(room);
    room.logDebug('I should build a Power Spawn at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_POWER_SPAWN);
    return;
  }
  
  // Nuker
  if (roomLevel > 7 &&
      !numConstructionSites &&
      !weakRampart &&
      !room.nuker &&
      !room.memory.preShutdown) {
    let pos = nukerPos(room);
    room.logDebug('I should build a Nuker at ' + pos.link);
    room.createConstructionSite(pos, STRUCTURE_NUKER);
    return;
  }
}

function nextExposedRampart(room) {
  return _.max(room.exposedBunkerTiles, function(pos) {return room.bunkerDistance(pos);});
}

function nextInteriorRampart(room) {
  return _.max(room.interiorBunkerTiles, function(pos) {return room.bunkerDistance(pos);});
}

function dx(direction) {
  return [undefined,0,1,1,1,0,-1,-1,-1][direction];
}

function dy(direction) {
  return [undefined,-1,-1,0,1,1,1,0,-1][direction];
}

function nextSpawnSite(room) {
  let tx = dx(room.orientation);
  let ty = dy(room.orientation);
  
  let spawnPositions = [
      {x:       0, y: -2 * ty},
      {x:       0, y:  2 * ty},
      {x: -2 * tx, y:       0}];
    
  let pos = findFirstUniqueElement(spawnPositions, room.spawns, room.bunkerCenter);
    
  return room.getPositionAt(
    room.bunkerCenter.x + pos.x,
    room.bunkerCenter.y + pos.y);
}

function nextSpawnName(room) {
  let code = room.memory.code;
  return _.difference(
      [code + '1', code + '2', code + '3'],
      _.keys(Game.spawns))[0];
}

let extensionCache = {};

function extensionPositions(orientation) {
  let exts = [];
  let tx = dx(orientation);
  let ty = dy(orientation);

  // RCL 1-3: The block opposite the terminal.
  exts.push({x:-tx * 1, y:-ty * 3});
  exts.push({x:-tx * 2, y:-ty * 3});
  exts.push({x:-tx * 3, y:-ty * 3});
  exts.push({x:-tx * 3, y:-ty * 2});
  exts.push({x:-tx * 3, y:-ty * 1});
  exts.push({x:-tx * 4, y:-ty * 2});
  exts.push({x:-tx * 4, y:-ty * 3});
  exts.push({x:-tx * 3, y:-ty * 4});
  exts.push({x:-tx * 2, y:-ty * 4});
  exts.push({x:-tx * 5, y:-ty * 5});

  // RCL 4: The first block's mirror-image across the vertical.
  exts.push({x:tx * 1, y:-ty * 3});
  exts.push({x:tx * 2, y:-ty * 3});
  exts.push({x:tx * 3, y:-ty * 3});
  exts.push({x:tx * 3, y:-ty * 2});
  exts.push({x:tx * 3, y:-ty * 1});
  exts.push({x:tx * 4, y:-ty * 2});
  exts.push({x:tx * 4, y:-ty * 3});
  exts.push({x:tx * 3, y:-ty * 4});
  exts.push({x:tx * 2, y:-ty * 4});
  exts.push({x:tx * 5, y:-ty * 5});

  // RCL5: Some fill around those two blocks.
  exts.push({x:-tx * 1, y:-ty * 5});
  exts.push({x:-tx * 2, y:-ty * 6});
  exts.push({x:-tx * 3, y:-ty * 6});
  exts.push({x:-tx * 6, y:-ty * 3});
  exts.push({x:-tx * 6, y:-ty * 2});
  exts.push({x:tx * 1, y:-ty * 5});
  exts.push({x:tx * 2, y:-ty * 6});
  exts.push({x:tx * 3, y:-ty * 6});
  exts.push({x:tx * 6, y:-ty * 3});
  exts.push({x:tx * 6, y:-ty * 2});
  
  // RCL6: More fill around the first two blocks.
  exts.push({x: tx * 4, y:0});
  exts.push({x: tx * 5, y:0});
  exts.push({x: tx * 5, y:-ty * 1});
  exts.push({x: tx * 5, y:-ty * 4});
  exts.push({x: tx * 4, y:-ty * 5});
  exts.push({x:-tx * 4, y:0});
  exts.push({x:-tx * 5, y:0});
  exts.push({x:-tx * 5, y:-ty * 1});
  exts.push({x:-tx * 5, y:-ty * 4});
  exts.push({x:-tx * 4, y:-ty * 5});

  // RCL7: The third block.
  exts.push({x:-tx * 1, y:ty * 3});
  exts.push({x:-tx * 2, y:ty * 3});
  exts.push({x:-tx * 3, y:ty * 3});
  exts.push({x:-tx * 3, y:ty * 2});
  exts.push({x:-tx * 3, y:ty * 1});
  exts.push({x:-tx * 4, y:ty * 2});
  exts.push({x:-tx * 4, y:ty * 3});
  exts.push({x:-tx * 3, y:ty * 4});
  exts.push({x:-tx * 2, y:ty * 4});
  exts.push({x:-tx * 5, y:ty * 5});
  
  // RCL8: Fill in the rest
  exts.push({x:      0, y:     5});
  exts.push({x:      0, y:    -4});
  exts.push({x:-tx * 1, y:ty * 5});
  exts.push({x:-tx * 2, y:ty * 6});
  exts.push({x:-tx * 3, y:ty * 6});
  exts.push({x:-tx * 4, y:ty * 5});
  exts.push({x:-tx * 5, y:ty * 4});
  exts.push({x:-tx * 6, y:ty * 3});
  exts.push({x:-tx * 6, y:ty * 2});
  exts.push({x:-tx * 5, y:ty * 1});

  return exts;
}

function findFirstUniqueElement(source, objects, centerPos) {
  let objectPositions = [];
  _(objects)
      .forEach(o => objectPositions.push({x: o.pos.x - centerPos.x, y: o.pos.y - centerPos.y}))
      .value();

  for (let i in source) {
    if (!_.find(objectPositions, source[i])) {
      return source[i];
    }
  }
}

function nextExtensionPos(room) {
  if (extensionCache[room.orientation] == undefined) {
    extensionCache[room.orientation] = extensionPositions(room.orientation);
  }
  
  let pos = findFirstUniqueElement(
    extensionCache[room.orientation], room.extensions, room.bunkerCenter);
    
  return room.getPositionAt(
    room.bunkerCenter.x + pos.x,
    room.bunkerCenter.y + pos.y);
}

function nextTowerPos(room) {
  // First tower goes directly opposite the terminal.
  // Second is at the same Y as the first, on the other side of the storage.
  // Third is directly opposite the second
  // Fourth is above the storage.
  // Fifth is below the storage.
  // Sixth is to the side of the storage, opposite the terminal.
  
  let tx = dx(room.orientation);
  let ty = dy(room.orientation);
  
  let towerPositions = [
      {x: -2 * tx, y: -2 * ty},
      {x:  2 * tx, y: -2 * ty},
      {x: -2 * tx, y:  2 * ty},
      {x:  0,      y: -1},
      {x:  0,      y:  1},
      {x:  -tx,    y: 0}];
    
  let pos = findFirstUniqueElement(towerPositions, room.towers, room.bunkerCenter);
    
  return room.getPositionAt(
    room.bunkerCenter.x + pos.x,
    room.bunkerCenter.y + pos.y);
}

function nextLabPos(room) {
  let tx = dx(room.orientation);
  let ty = dy(room.orientation);
  
  let labPositions = [
      {x: 2 * tx, y: 4 * ty},
      {x: 3 * tx, y: 4 * ty},
      {x: 4 * tx, y: 3 * ty},
      {x: 4 * tx, y: 2 * ty},
      {x: 5 * tx, y: 2 * ty},
      {x: 5 * tx, y: 3 * ty},
      {x: 5 * tx, y: 4 * ty},
      {x: 4 * tx, y: 5 * ty},
      {x: 3 * tx, y: 5 * ty},
      {x: 2 * tx, y: 5 * ty}];
    
  let pos = findFirstUniqueElement(labPositions, room.labs, room.bunkerCenter);
    
  return room.getPositionAt(
    room.bunkerCenter.x + pos.x,
    room.bunkerCenter.y + pos.y);
}

function nukerPos(room) {
  return room.getPositionAt(
    room.bunkerCenter.x,
    room.bunkerCenter.y-5);
}

function observerPos(room) {
  return room.getPositionAt(
    room.bunkerCenter.x,
    room.bunkerCenter.y-6);
}

function powerSpawnPos(room) {
  return room.getPositionAt(
    room.bunkerCenter.x,
    room.bunkerCenter.y+4);
}

function terminalPos(room) {
  let terminalFlag = room.find(FIND_FLAGS, {filter: f => f.name.startsWith('Terminal')})[0];
  if (terminalFlag) {
    return terminalFlag.pos;
  }
  return room.getPositionAt(
      room.bunkerCenter.x + 2 * dx(room.orientation),
      room.bunkerCenter.y + 2 * dy(room.orientation));
}

function factoryPos(room) {
  return room.getPositionAt(
      room.terminal.pos.x + ((room.terminal.pos.x - room.storage.pos.x) >> 1),
      (room.storage.pos.y + room.terminal.pos.y) >> 1);
}

function storageLinkPos(room) {
  return room.getPositionAt(
      room.bunkerCenter.x + 2 * dx(room.orientation),
      room.bunkerCenter.y);
}

let shellPositions = {};

function initOuterRing() {
  shellPositions[6] = [];
  
  function pushFour(x, y) {
      shellPositions[6].push({x: x, y: y});
      shellPositions[6].push({x: -y, y: x});
      shellPositions[6].push({x: -x, y: -y});
      shellPositions[6].push({x: y, y: -x});
  }
  
  for (let x= -5; x <= 5; x++) {
    pushFour(x, 6);
  }
  pushFour(5, 5);
}

function nextExteriorRampartPos(room) {
  if (!shellPositions[6]) {
    initOuterRing();
  }
  
  let outerRing = shellPositions[6];
  
  for (let i=0; i < outerRing.length; i++) {
    let pos = room.getPositionAt(
      outerRing[i].x + room.bunkerCenter.x,
      outerRing[i].y + room.bunkerCenter.y);
      
    if (pos.tileType == TILE_EXTERIOR) {
      return pos;
    }
  }
}

module.exports = {
  update,
}