'use strict';

let Books = require('util_books');
let RoomCallback = require('util_roomCallback');

StructureSpawn.prototype.logError = function(text) {
  this.memory.logError = text;
  console.log(this.name + ': ' + text);
}

Object.defineProperty(StructureSpawn.prototype, 'disruptTicksRemaining', {
	get: function() {
			let effect = _.find(this.effects, e => e.power == PWR_DISRUPT_SPAWN);

			return (effect && effect.ticksRemaining) || 0;
	},
	set: function(){},
	enumerable: false,
	configurable: true,
});

Object.defineProperty(StructureSpawn.prototype, 'hasOperate', {
  get: function() {
    return _.any(this.effects, e => e.power == PWR_OPERATE_SPAWN);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureSpawn.prototype, 'needsOperate', {
  get: function() {
    let ordered = (this.room.memory.operateSpawnUntil > Game.time) ||
        (this.memory.operateUntil > Game.time);
    let backlogged = this.room.spawnBacklogged && this.room.roughInventory(RESOURCE_OPS) > 10000;

    return this.room.controller.isPowerEnabled && !this.hasOperate && (ordered || backlogged);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureSpawn.prototype, 'isDiggerSpawn', {
  get: function() {
    return this.my &&
        this.active &&
        this.room.memory.digsites &&
        _.any(this.room.memory.digsites, s => s.spawn == this.id);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

function updateSpawnVisual(spawn) {
  let spawningCreep = Game.creeps[spawn.spawning.name];
  if (!spawningCreep) {
    return;
  }
  spawn.room.visual.text(
    '🛠️' + spawningCreep.memory.role,
    spawn.pos.x + 1,
    spawn.pos.y, {
      align: 'left',
      opacity: 0.8
    });

  if (spawn.memory.blocked) {
    spawn.room.visual.circle(
      spawn.pos.x,
      spawn.pos.y,
      {
        radius: 0.5,
        fill: 'red'
      });
  }
}

function recycleACreep(spawn, adjacentCreeps) {
  for (let i = 0; i < adjacentCreeps.length; i++) {
    const creep = adjacentCreeps[i];
    if (creep.memory.killMe) {
      spawn.myRecycleCreep(creep);
    }
  }
}

function renewACreep(spawn, adjacentCreeps) {
  // Don't renew when starving.
  if (spawn.room.energyCapacityAvailable > 1200 && spawn.room.energyAvailable <= 300) return;

  let renewables = _.filter(
    adjacentCreeps,
    creep => (creep.ticksToLive + creep.renewTicks <= 1500) &&
        creep.my &&
        (!creep.boosted || (creep.ticksToLive < creep.memory.renewBelow)) &&
        !creep.memory.noRenew &&
        !creep.renewIncoming &&
        !creep.getActiveBodyparts(CLAIM) &&
        ((getBodyCost(creep.body) > spawn.room.energyCapacityAvailable) || creep.memory.renewMe)
  );

  if (!renewables.length) {
    return false;
  }

  let creep = _.min(renewables, 'ticksToLive');

  let renewResult = spawn.renewCreep(creep);
  spawn.logDebug('renewResult=' + renewResult);
  if (renewResult == OK) {
    spawn.room.visual.line(spawn.pos, creep.pos, {
      color: 'cyan',
      opacity: 1
    });
    creep.renewIncoming = true;
  }
  return true;
}

function getEnergyStructures(spawn) {
  let room = spawn.room;

  switch (room.baseType) {
    case 'bunker':
      return room.spawns
        .concat(room.extensions);
    case 'tigga':
      return room.diggerExtensions
        .concat(room.spawnExtensions)
        .concat(room.spawns)
        .concat(room.storageExtensions)
        .concat(room.otherExtensions);
    case 'lw':
      return room.spawns
      .concat(room.diggerExtensions)
      .concat(room.craneExtensions)
      .concat(room.otherExtensions);
    default:
      return room.spawns
        .concat(room.storageExtensions)
        .concat(room.diggerExtensions)
        .concat(room.otherExtensions);
  }
}

function operateOnRequestingComponent(spawn, job) {
  if (!job.opts || !job.opts.requestingRoom || !job.opts.requestingComponent) {
    return;
  }

  let name = job.name;
  let spawnTime = Game.time;
  let spawnedBy = spawn.name;
  _.set(Memory.rooms[job.opts.requestingRoom],
      job.opts.requestingComponent + '._lastSpawn',
      {name, spawnTime, spawnedBy});
}

function operateOnRequestingCreep(spawn, job) {
  if (!job.opts || !job.opts.requestingCreep) {
    return;
  }

  let requestingCreep = Game.getObjectById(job.opts.requestingCreep);
  if (!requestingCreep) {
    return;
  }

  let name = job.name;
  let spawnTime = Game.time;
  let spawnedBy = spawn.name;
  requestingCreep.memory._lastSpawn = {name, spawnTime, spawnedBy};
}

function operateOnRequestingFlag(spawn, job) {
  if (!job.opts || !job.opts.memory.flagName) {
    return;
  }

  let mem = job.opts.memory;

  if (Memory.flags[mem.flagName].role != 'spawner') {
    return;
  }

  if (!mem.flagName || !Memory.flags[mem.flagName][mem.role]) {
    spawn.logError(`Unlikely operateOnRequestingFlag error`);
    return;
  }

  let flagRole = Memory.flags[mem.flagName][mem.role];

  let name = job.name;
  let spawnTime = Game.time;
  let spawnedBy = spawn.name;
  flagRole._lastSpawn = {name, spawnTime, spawnedBy};
}

function makeQueuedSpawn(spawn) {
  if (spawn.memory.noSpawn) {
    return;
  }
  let eligibleJobs = _.filter(
      Memory.spawnJobs,
      j => j.rooms.includes(spawn.room.name) &&
          (!j.spawns || j.spawns.includes(spawn.name)) &&
          j.bodyCost <= spawn.room.energyAvailable &&
          j.error != ERR_INVALID_ARGS
  );
  spawn.logDebug(eligibleJobs.length + ' eligible spawn jobs.')

  if (!eligibleJobs.length) {
    return;
  }

  // Get the highest-priority one. Break ties arbitrarily.
  let bestJob = _.min(eligibleJobs, 'priority');

  let opts = bestJob.opts;
  opts.memory.spawnedBy = spawn.name;
  opts.memory.spawnTime = Game.time;
  opts.energyStructures = getEnergyStructures(spawn);

  let roomToBill = (Game.flags[opts.memory.flagName] && Game.flags[opts.memory.flagName].pos.roomName) ||
      opts.memory.workRoom ||
      spawn.room.name;

  if (!opts.directions && opts.destination) {
    let path = spawn.pos.findPathTo(
        opts.destination,
        {ignoreCreeps:true, costCallback:RoomCallback.applySpawnBlockers});
    if (path.length) {
      // Make all directions spawnable, but prefer the path start.
      let dir = path[0].direction;
      let diggerDir = spawn.pos.getDirectionTo(spawn.source && spawn.source.diggerPosition);
      let craneDir = spawn.pos.getDirectionTo(spawn.cranePosition);
      opts.directions = _([1, 2, 3, 4, 5, 6, 7, 8])
          .without(dir, diggerDir, craneDir)
          .unshift(dir)
          .value();
    }
  } else if (!opts.directions && spawn.source && spawn.source.diggerPosition) {
    opts.directions =
        _.without([1,2,3,4,5,6,7,8], spawn.pos.getDirectionTo(spawn.source.diggerPosition));
  }

  let spawnResult = spawn.spawnCreep(bestJob.body, bestJob.name, opts);

  if (spawnResult == OK) {
    try {
      operateOnRequestingComponent(spawn, bestJob);
    } catch (err) {
      spawn.logError(`operateOnRequestingComponent error: ${err}`);
    }
    try {
      operateOnRequestingCreep(spawn, bestJob);
    } catch (err) {
      spawn.logError(`operateOnRequestingCreep error: ${err}`);
    }
    try {
      operateOnRequestingFlag(spawn, bestJob);
    } catch (err) {
      spawn.logError(`operateOnRequestingFlag error: ${err}`);
    }
    Books.logEnergy(roomToBill, 'spawn', bestJob.bodyCost);
    spawn.logDebug('spawning model-' + opts.memory.model + ' ' +
          opts.memory.role + ' ' + bestJob.name + ' for ' +
          opts.memory.flagName);
    delete Memory.spawnJobs[bestJob.key];
    abortSpawns[spawn.room.name] = Game.time;
    return true;
  } else if (spawnResult != ERR_NOT_ENOUGH_ENERGY) {
    spawn.logError('failed to spawn creep ' + bestJob.name + ': ' + spawnResult);
    Memory.spawnJobs[bestJob.key].error = spawnResult;
  } else {
    spawn.logDebug('Not enough energy');
  }

  return false;
}

StructureSpawn.prototype.engageBlock = function() {
  if (!this.spawning) {
    return ERR_FAILED_PRECONDITION;
  }

  let neighbors = this.room.lookForAtArea(
      LOOK_STRUCTURES,
      this.pos.y - 1,
      this.pos.x - 1,
      this.pos.y + 1,
      this.pos.x + 1,
      /* asArray = */ true);

  let blockingStructure = _.find(
      neighbors,
      s => s.structure != this && OBSTACLE_OBJECT_TYPES.includes(s.structure.structureType));

  let dir = this.pos.getDirectionTo(blockingStructure.structure);

  if (!dir) {
    this.logError('Cannot honor engageBlock request--no blocking neighbors.');
    return ERR_FAILED_PRECONDITION;
  }

  let result = this.spawning.setDirections([dir]);
  if (result == OK) {
    this.logDebug('engaging block');
    this.memory.blocked = true;
  } else {
    this.logError('Error setting directions: ' + result);
  }

  return result;
}

StructureSpawn.prototype.releaseBlock = function(directions) {
  if (!this.spawning) {
    return ERR_FAILED_PRECONDITION;
  }

  if (!directions) {
    directions = [1,2,3,4,5,6,7,8];
    if (this.source && this.source.diggerPosition) {
      directions = _.without(directions, this.pos.getDirectionTo(this.source.diggerPosition));
    }
  }

  if (this.spawning.setDirections(directions) == OK) {
    this.logDebug('releasing block');
    delete this.memory.blocked;
  }

  return OK;
}

function updateSpawnHold(spawn) {
  let creep = Game.creeps[spawn.spawning.name];
  if (spawn.memory.blocked) {
    if (!creep.memory.holdSpawn) {
      spawn.releaseBlock();
    }
  } else {
    if (creep.memory.holdSpawn) {
      spawn.engageBlock();
    }
  }
}

function setSpawnDir(spawn, spawnDir) {
  if (spawnDir >= 0 && spawnDir < 8) {
    spawn.spawning.setDirections([spawnDir]);
  } else {
    creep.logError(`Unexpected getDirectionTo result: ${spawnDir}`);
  }
}

StructureSpawn.prototype.census = function() {
  let myChildren = _.filter(
    Game.creeps,
    c => c.memory.spawnedBy == this.name);

  let bodies = _.sum(
    myChildren,
    function(c) {
      return c.body.length;
    });
  return `${myChildren.length} creeps totaling ${bodies} body parts.`;
}

let abortSpawns = {};

StructureSpawn.prototype.execute = function() {
  let spawn = this;
  let adjacentCreeps = this.pos.findInRange(spawn.room.myCreeps, 1);

  if (!spawn.active) {
    return;
  }

  recycleACreep(this, adjacentCreeps);

  if (spawn.room.memory.shutdownSpawn) {
    return;
  }

  if (spawn.spawning) {
    updateSpawnHold(spawn);
    updateSpawnVisual(spawn);
    return;
  }

  if (spawn.room.nukes.length) {
    let soonest = _.min(spawn.room.nukes, 'timeToLand');
    if (soonest.timeToLand < 250) {
      if (Game.time % 10 == 0) {
        logError('No action. Nuke very soon.');
      }
      return;
    }
  }

  if (abortSpawns[spawn.room.name] == Game.time) {
    // Another spawn in this same room has already decided to spawn
    // nothing. Maybe renew, then done.
    renewACreep(spawn, adjacentCreeps);
    return false;
  } else if (makeQueuedSpawn(spawn)) {
    //
  } else if (renewACreep(spawn, adjacentCreeps)) {
    //
  }
}

StructureSpawn.prototype.myRecycleCreep = function (creep) {
  return this.recycleCreep(creep);
}

StructureSpawn.prototype.logDebug = function (message) {
  if (this.memory.debug) {
    console.log(this.name + ': ' + message);
  }
}

StructureSpawn.prototype.logError = function (message) {
  console.log(this.name + ': ' + message);
}

Object.defineProperty(StructureSpawn.prototype, 'source', {
  get: function() {
    if (this._source) return this._source;

    return this._source = _.find(this.pos.findInRange(FIND_SOURCES,2),
        s => this.room.memory.digsites &&
            this.room.memory.digsites[s.id] &&
            this.room.memory.digsites[s.id].spawn == this.id);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(StructureSpawn.prototype, 'cranePosition', {
  get: function() {
    if (this._cranePosition) return this._cranePosition;

    return this._cranePosition = this.pos.isNearTo(this.room.cranePosition)
        && this.room.cranePosition
        || undefined;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});
