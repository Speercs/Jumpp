'use strict';

require('prototype_Room.activeStructures');
require('prototype_Room.base');
require('prototype_Room.boost');
require('prototype_Room.constructionSites');
require('prototype_Room.containers');
require('prototype_Room.core');
require('prototype_Room.cranePosition');
require('prototype_Room.craneTowers');
require('prototype_Room.events');
require('prototype_Room.extensions');
require('prototype_Room.factory');
require('prototype_Room.hostiles');
require('prototype_Room.inventory');
require('prototype_Room.labs');
require('prototype_Room.links');
require('prototype_Room.mainStore');
require('prototype_Room.normalMap');
require('prototype_Room.nukes');
require('prototype_Room.orders');
require('prototype_Room.recycle');
require('prototype_Room.resources');
require('prototype_Room.sector');
require('prototype_Room.siegeMap');
require('prototype_Room.structures');
require('prototype_Room.towerDamageMap');
require('prototype_Room.upgradePositions');

let EventLog = require('util_event_log');
let RoomBase = require('room_role_base_base');
let RoomBlocker = require('room_role_blocker');
let RoomCenter = require('room_role_center');
let RoomHighway = require('room_role_highway');
let RoomMine = require('room_role_mine');
let RoomOutpost = require('room_role_outpost');
let RoomSkLair = require('room_role_skLair');
let RoomWilderness = require('room_role_wilderness');
let Scout = require('room_components_scout');
let Nav = require('util_nav');

Object.defineProperty(Room.prototype, 'availableStorageSpace', {
  get: function() {
    return (this.storage && this.storage.store.getFreeCapacity()) || 0;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'availableTerminalSpace', {
  get: function() {
    return (this.terminal && this.terminal.store.getFreeCapacity()) || 0;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'hostile', {
  get: function() {
    if (this._hostile) {
      return this._hostile;
    }

    if (!this.controller) {
      return this._hostile = !!this.invaderCore;
    }

    let owner = false;

    if (this.controller.level) {
      owner = this.controller.owner.username;
    } else if (this.controller.reservation) {
      owner = this.controller.reservation.username;
    }

    return owner && owner != MY_USERNAME && !isFriendly(owner);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'needsSign', {
  get: function() {
    if (!this.controller ||
        (this.controller.sign && this.controller.sign.text == MY_MARK) ||
        (this.controller.level && !this.controller.my)) {
      return false;
    }

    let miner = Scout.roomMiner(this.name);
    if (miner && miner != MY_USERNAME) {
      return false;
    }

    if (this.sector.myBases.length > 1) {
      return true;
    }

    if (_.any(Game.bases, b => Nav.getRoomDistanceManhattan(b.name, this.name) <= 5)) {
      return true;
    }

    return false;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'spawnBacklogged', {
  get: function() {
    if (this._spawnBacklogged) {
      return this._spawnBacklogged;
    }

    let backlogBodyParts = Memory.spawnBacklog[this.name];
    let criticalPartsBacklog = 20 * this.spawns.length;

    return this._spawnBacklogged = backlogBodyParts > criticalPartsBacklog;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'basecourierModel', {
  get: function() {
    let roomLevel = (this.controller && this.controller.level) || 0;
    let permittedByRCL = [0, 0, 0, 4, 6, 8, 15, 15, 15][roomLevel];
    let permittedByECA = this.energyCapacityAvailable / 150;
    return Math.min(permittedByRCL, permittedByECA);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'baseType', {
  get: function() {
    if (this._baseType) {
      return this._baseType;
    }

    if (!this.controller || !this.controller.my) {
      return this._baseType = 'none';
    }
    if (_.includes(['bunker', 'tigga', 'lw'], this.memory.baseType)) {
      return this._baseType = this.memory.baseType;
    }
    return this._baseType = 'unknown';
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'bunkerCenter', {
  get: function() {
    if (this._bunkerCenter) {
      return this._bunkerCenter;
    }

    if (this.storage && this.storage.my) {
      return this._bunkerCenter = this.storage.pos;
    }

    if (this.memory.bunkerCenter) {
      return this._bunkerCenter = this.getPositionAt(
        this.memory.bunkerCenter.x,
        this.memory.bunkerCenter.y);
    }

    return this._bunkerCenter = undefined;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'isMyBase', {
  get: function() {
    return !!(this.controller && this.controller.my);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'isOvermindBase', {
  get: function() {
    return this.controller &&
        !this.controller.my &&
        this.controller.sign &&
        this.controller.sign.text &&
        this.controller.sign.text.toLowerCase().replace(/\W/g, '').includes('overmind');
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'guardPosition', {
  get: function() {
    if (this._guardPosition) {
      return this._guardPosition;
    }

    return this._guardPosition = roomGuardPosition(this.name);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'level', {
  get: function() {
    return (this.controller && this.controller.level) || 0;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'maxExtensions', {
  get: function() {
    if (this._maxExtensions) {
      return this._maxExtensions;
    }

    return this._maxExtensions =
      [0, 0, 5, 10, 20, 30, 40, 50, 60][this.level];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'maxLabs', {
  get: function() {
    return [0, 0, 0, 0, 0, 0, 3, 6, 10][this.level];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'maxLinks', {
  get: function() {
    return [0, 0, 0, 0, 0, 2, 3, 4, 6][this.level];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'maxSpawns', {
  get: function() {
    if (this._maxSpawns) {
      return this._maxSpawns;
    }

    return this._maxSpawns = [1, 1, 1, 1, 1, 1, 1, 2, 3][this.level];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'maxTowers', {
  get: function() {
    if (this._maxTowers) {
      return this._maxTowers;
    }

    return this._maxTowers = [0, 0, 0, 1, 1, 2, 2, 3, 6][this.level];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'mineral', {
  get: function() {
    return this.find(FIND_MINERALS)[0];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'mineralContainer', {
  get: function() {
    if (this._mineralContainer) {
      return this._mineralContainer;
    }

    return this._mineralContainer =  _(this.memory.digsites)
      .filter(d => d.mineralId)
      .map('container')
      .map(Game.getObjectById)
      .value()[0] || undefined;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'my', {
  get: function() {
    return this.controller && this.controller.my;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

let getNativeMineral = _.memoize(function(roomName) {
  let room = Game.rooms[roomName];

  if (!room) {
    throw `Must be called on rooms where we have visibility.`;
  }

  let minerals = room.find(FIND_MINERALS);

  if (!minerals) {
    return;
  }

  return minerals[0].mineralType;
});

let nativeCommodities = {};

Object.defineProperty(Room.prototype, 'nativeCommodity', {
  get: function() {
    if (!nativeCommodities[this.name]) {
      nativeCommodities[this.name] =
          _(COMMODITIES[this.nativeMineral].components).keys().find(s => s != RESOURCE_ENERGY);
    }
    return nativeCommodities[this.name];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

let nativeMinerals = {};

Object.defineProperty(Room.prototype, 'nativeMineral', {
  get: function() {
    if (!nativeMinerals[this.name]) {
      nativeMinerals[this.name] = getNativeMineral(this.name);
    }

    return nativeMinerals[this.name];
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'nativeDepositType', {
  get: function() {
    let roomXy = Nav.roomNameToXY(this.name);
    let x = roomXy[0], y = roomXy[1];

    if (Game.shard.name == 'shard1') {
      if (x > 0 && y < 0) {
        return RESOURCE_BIOMASS;
      } else if (x < 0 && y > 0) {
        return RESOURCE_SILICON;
      }
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'orientation', {
  get: function() {
    if (this._orientation) {
      return this._orientation;
    }

    // Terminal in final position indicates orientation
    if (this.storage &&
      this.storage.my &&
      this.terminal &&
      this.terminal.my &&
      this.storage.pos.getRangeTo(this.terminal) == 2) {
      return this._orientation =
        this.storage.pos.getDirectionTo(this.terminal);
    }

    if (this.memory.orientation) {
      return this._orientation = this.memory.orientation;
    }

    return;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'powerEnabled', {
  get: function() {
    return this.controller && this.controller.isPowerEnabled;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'repairableContainers', {
  get: function() {
    if (this._repairableContainers) {
      return this._repairableContainers;
    }

    if (!this.memory.noRepair || !this.memory.noRepair.length) {
      return this._repairableContainers = this.containers;
    }

    return this._repairableContainers = _.filter(
      this.containers, r => !this.memory.noRepair.includes(r.id));
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'repairableRoads', {
  get: function() {
    if (this._repairableRoads) {
      return this._repairableRoads;
    }

    if (!this.memory.noRepair || !this.memory.noRepair.length) {
      return this._repairableRoads = this.roads;
    }

    return this._repairableRoads = _.filter(
      this.roads, r => !this.memory.noRepair.includes(r.id));
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

// Coarse room energy -- just terminal and storage. Try to use this instead of
// the more detailed inventory energy, because we'd like to take inventory less
// frequently.
Object.defineProperty(Room.prototype, 'roughEnergy', {
  get: function() {
    if (this._roughEnergy) {
      return this._roughEnergy;
    } else {
      let storageEnergy = (this.storage && this.storage.store.energy) || 0;
      let terminalEnergy = (this.terminal && this.terminal.store.energy) || 0;

      // Count battery energy as energy on hand, but:
      // - Limit it to, at most, 1/2 of energy on hand, and
      // - Don't count the first 10,000 batteries.
      let storageBattery = (this.storage && this.storage.store.battery) || 0;
      let terminalBattery = (this.terminal && this.terminal.store.battery) || 0;
      let totalBattery = Math.max(0, storageBattery + terminalBattery - 10000);
      let rawEnergy = storageEnergy + terminalEnergy;
      let boundedBatteryEnergy = _.floor(Math.min(rawEnergy / 2, totalBattery * 10));

      return this._roughEnergy = rawEnergy + boundedBatteryEnergy;
    }
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'courierIdlePos', {
  get: function() {
    if (this._courierIdlePos) {
      return this._courierIdlePos;
    }
    if (this.memory.basecourierIdlePos) {
      return this._courierIdlePos = this.getPositionAt(
        this.memory.basecourierIdlePos.x,
        this.memory.basecourierIdlePos.y);
    }
    if (this.controller && this.controller.my &&
        this.baseType == 'bunker' &&
        this.storage && this.storage.my &&
        this.terminal && this.terminal.my && !this.terminal.servingController) {
      let x = (this.storage.pos.x + this.terminal.pos.x) >> 1;
      let y = this.terminal.pos.y + ((this.terminal.pos.y - this.storage.pos.y) >> 1);
      return this._courierIdlePos = this.getPositionAt(x,y);
    }
    if (this.bunkerCenter && this.memory.orientation) {
      let x = this.bunkerCenter.x + dx(this.memory.orientation);
      let y = this.bunkerCenter.y + 3 * dy(this.memory.orientation);
      return this._courierIdlePos = this.getPositionAt(x,y);
    }
    return undefined;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'upgraderWorksOnStation', {
  get: function() {
    if (this._upgraderWorksOnStation) {
      return this._upgraderWorksOnStation;
    }
    return this._upgraderWorksOnStation = _(this.upgraders)
      .filter(c => c.pos.inRangeTo(this.controller, 3))
      .sum(c => c.getActiveBodyparts(WORK));
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Room.prototype.abandonAllRoads = function() {
  this.memory.noRepair = _(this.roads).map('id').value();
  return this.memory.noRepair;
}

Room.prototype.hashTime = function(period) {
  return this.name.hashCode() % period == Game.time % period;
}

Room.prototype.ticksToNextLowRampart = function() {
  if (this._ticksToNextLowRampart != undefined) {
    return this._ticksToNextLowRampart;
  }

  let nonLowRamparts = _.filter(this.ramparts, r => !r.low);

  if (!nonLowRamparts.length) {
    return this._ticksToNextLowRampart = 0;
  }

  return this._ticksToNextLowRampart = _.min(nonLowRamparts, 'ticksToLow').ticksToLow;
}

Room.prototype.towerDamageAtPos = function(pos) {
  if (!pos instanceof RoomPosition || pos.roomName != this.name) {
    this.logError('arg0 is not RoomPosition');
    return ERR_INVALID_ARGS;
  }

  return _.sum(_.map(this.towers, t => t.attackPowerAtPos(pos)));
}

// For each room, array of ids of 'low' ramparts.
let lowRampartsCache = {};

// For each room, Game time at which we'd expect decay to bring a rampart low.
let rampartDecayCache = {};

Object.defineProperty(Room.prototype, 'lowRamparts', {
  get: function() {
    if (this._lowRamparts) {
      return this._lowRamparts;
    }

    if (!lowRampartsCache[this.name] ||
        !rampartDecayCache[this.name] ||
        rampartDecayCache[this.name] <= Game.time) {
      let lowRamparts = _.filter(this.ramparts, 'low');
      lowRampartsCache[this.name] = _.map(lowRamparts, 'id');
      rampartDecayCache[this.name] = Game.time + this.ticksToNextLowRampart();
      return this._lowRamparts = lowRamparts;
    }

    if (!lowRampartsCache[this.name].length) {
      return this._lowRamparts = [];
    }

    let lowRamparts = _(lowRampartsCache[this.name])
        .map(Game.getObjectById)
        .filter(r => r && r.low)
        .compact()
        .value();
    
    if (lowRamparts.length != lowRampartsCache[this.name].length) {
      lowRampartsCache[this.name] = _.map(lowRamparts, 'id');
      rampartDecayCache[this.name] = Game.time + this.ticksToNextLowRampart();
    }

    return this._lowRamparts = lowRamparts;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Room.prototype.checkRampart = function(rampart) {
  if (!rampart) {
    this.logError(`checkRampart called with bad arg.`);
    return ERR_INVALID_ARGS;
  }

  if (rampart.room.name != this.name) {
    this.logError(`checkRampart called with foreign rampart.`);
    return ERR_INVALID_ARGS;
  }

  if (this.memory.role != 'base') {
    return OK;
  }

  if (!lowRampartsCache) {
    lowRampartsCache = {};
  }

  if (!lowRampartsCache[this.name]) {
    lowRampartsCache[this.name] = [];
  }

  // Maybe update the room's decay time.
  let rampartDecayTime = Game.time + rampart.ticksToLow;
  if (rampart.ticksToLow && rampartDecayTime < rampartDecayCache[this.name]) {
    rampartDecayCache[this.name] = rampartDecayTime;
  }

  // Maybe update the room's low list.
  let myLowRamparts = lowRampartsCache[this.name];
  let isListed = myLowRamparts.includes(rampart.id);

  if (rampart.low && !isListed) {
    myLowRamparts.push(rampart.id);
  } else if (isListed && !rampart.low) {
    _.pull(myLowRamparts, rampart.id);
  }

  return OK;
}

/**
 * Returns an array containing the names of all highway rooms within the specified range.
 */
Room.prototype.findHighwaysInRangeChebyshev = function(range) {
  let xy = Nav.roomNameToXY(this.name);
  let cx = xy[0];
  let cy = xy[1];
  let results = [];
  for (let x = -range; x <= range; x++) {
    for (let y = -range; y <= range; y++) {
      let roomName = Nav.getRoomNameFromXY(cx + x, cy + y);
      if (roomName.isHighway()) {
        results.push(roomName);
      }
    }
  }
  return results;
}

/**
 * Returns an array containing the names of all highway rooms within the specified range.
 */
Room.prototype.findHighwaysInRangeManhattan = function(range) {
  let maxRoomCoord = (Game.map.getWorldSize() - 2) / 2;
  let xy = Nav.roomNameToXY(this.name);
  let cx = xy[0];
  let cy = xy[1];
  let results = [];
  for (let x = -range; x <= range; x++) {
    if (Math.abs(cx + x) > maxRoomCoord) continue;
    let yRange = range - Math.abs(x);
    for (let y = -yRange; y <= yRange; y++) {
      if (Math.abs(cy + y) > maxRoomCoord) continue;
      let roomName = Nav.getRoomNameFromXY(cx + x, cy + y);
      if (roomName.isHighway()) {
        results.push(roomName);
      }
    }
  }
  return results;
}

/**
 * Returns an array containing the names of all controller rooms within the specified range.
 */
Room.prototype.findControllersInRangeManhattan = function(range) {
  let roomMax = Game.map.getWorldSize() / 2 - 1;
  let xy = Nav.roomNameToXY(this.name);
  let cx = xy[0];
  let cy = xy[1];
  let results = [];
  for (let x = -range; x <= range; x++) {
    if (Math.abs(cx + x) > roomMax) {
      continue;
    }
    let yRange = range - Math.abs(x);
    for (let y = -yRange; y <= yRange; y++) {
      if (Math.abs(cy + y) > roomMax) {
        continue;
      }
      let roomName = Nav.getRoomNameFromXY(cx + x, cy + y);
      if (roomName.hasController()) {
        results.push(roomName);
      }
    }
  }
  return results;
}

Object.defineProperty(Room.prototype, 'link', {
  get: function() {
    return `<a href = '${roomURL(this.name)}'>${this.name}</a>`;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'lowestRampart', {
  get: function() {
    return _.min(this.ramparts, 'hits');
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'nearestTerminalBase', {
  get: function() {
    if (this._nearestTerminalBase) {
      return this._nearestTerminalBase;
    }

    let possibles = _.filter(Game.terminalBases, tb => tb.name != this.name);

    if (!possibles.length) {
      return this._nearestTerminalBase = null;
    }

    return this._nearestTerminalBase =
      _.min(possibles, r => Game.map.getRoomLinearDistance(this.name, r.name));
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'nearestNonLwTerminalBase', {
  get: function() {
    if (this._nearestNonLwTerminalBase) {
      return this._nearestNonLwTerminalBase;
    }

    let possibles =
        _.filter(Game.terminalBases, tb => tb.name != this.name && tb.baseType != 'lw');

    if (!possibles.length) {
      return this._nearestNonLwTerminalBase = null;
    }

    return this._nearestNonLwTerminalBase =
        _.min(possibles, r => Game.map.getRoomLinearDistance(this.name, r.name));
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'nearestVault', {
  get: function() {
    if (this._nearestVault) {
      return this._nearestVault;
    }

    if (Game.vaults.length == 1) {
      return this._nearestVault = Game.vaults[0];
    }

    let possibles = _.filter(
      Game.terminalBases,
      b => b.controller.level == 8 &&
         b.controller.isPowerEnabled &&
         b.isVault &&
         b.roughInventory(RESOURCE_OPS) > 10000);

    if (!possibles.length) {
      return this._nearestVault = null;
    }

    return this._nearestVault =
      _.min(possibles, r => Game.map.getRoomLinearDistance(this.name, r.name));
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'isPowerEnabled', {
  get: function() {
    return !this.controller || this.controller.isPowerEnabled;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'isVault', {
  get: function() {
    return !!(this.memory.isVault && this.isPowerEnabled);
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

// There's a power backlog if this much power is in vault.
const POWER_BACKLOG_AMOUNT = 1500000;

Object.defineProperty(Room.prototype, 'hasPowerBacklog', {
  get: function() {
    if (this._hasPowerBacklog !== undefined) return this._hasPowerBacklog;

    return this._hasPowerBacklog = this.isVault &&
        this.storage &&
        this.storage.store[RESOURCE_POWER] >= POWER_BACKLOG_AMOUNT;
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Object.defineProperty(Room.prototype, 'spawnerFlags', {
  get: function() {
    if (this._spawnerFlags) {
      return this._spawnerFlags;
    }

    return this._spawnerFlags =
        this.find(FIND_FLAGS, {filter: f => f.memory.role == 'spawner' && f.memory.execute});
  },
  set: function(){},
  enumerable: false,
  configurable: true,
});

Room.prototype.roughInventory = function(resourceType) {
  return (this.storage && this.storage.store[resourceType] || 0) +
      (this.terminal && this.terminal.store[resourceType] || 0) +
      (this.factory && this.factory.store[resourceType] || 0) +
      (this.storageCrane && this.storageCrane.store[resourceType] || 0) +
      (this.basecouriers.length && this.basecouriers[0].store[resourceType] || 0);
}

Room.prototype.execute = function () {
  let room = this;
  let t0 = Game.cpu.getUsed();
  if (!Memory.profile.byRoom) {
    Memory.profile.byRoom = {};
  }
  if (!Memory.profile.byRoomRole) {
    Memory.profile.byRoomRole = {};
  }

  if (room.controller) {
    room.memory.controllerPos = {
      x: room.controller.pos.x,
      y: room.controller.pos.y
    };
  }

  if (!room.memory.role) {
    room.memory.role = room.name.isHighway() ? 'highway' : 'wilderness';
    room.memory.execute = false;

    if (room.controller) {
      room.memory.controllerPos = {
        x: room.controller.pos.x,
        y: room.controller.pos.y
      };
    }
  }

  room.memory._lastVisible = Game.time;

  room._checkHostilesCache();

  switch(room.memory.role) {
    case 'mine':
      RoomMine.run(room);
      break;
    case 'base':
      try {
        if (room.memory.execute) {
          RoomBase.run(room);
        }
      } catch (err) {
        room.logError(`RoomBase.run error: ${err}`);
      }
      break;
    case 'highway':
      RoomHighway.run(room);
      break;
    case 'wilderness':
      RoomWilderness.run(room);
      break;
    case 'skLair':
      RoomSkLair.run(room);
      break;
    case 'blocker':
      if (room.memory.execute) {
        RoomBlocker.run(room);
      }
      break;
    case 'center':
      RoomCenter.run(room);
      break;
    case 'outpost':
      if (room.memory.execute) {
        RoomOutpost.run(room);
      }
      break;
    default:
      room.logError('Unrecognized role: ' + room.memory.role);
      break;
  }
  let t1 = Game.cpu.getUsed();
  Memory.profile.byRoom[room.name] = t1 - t0;
  if (!Memory.profile.byRoomRole[room.memory.role]) {
    Memory.profile.byRoomRole[room.memory.role] = {};
  }
  let mem = Memory.profile.byRoomRole[room.memory.role];
  mem.total = (mem.total || 0) + (t1-t0);
  mem.n = (mem.n || 0) + 1;
  mem.mean = _.round(mem.total / mem.n, 3);
}

Room.prototype.buyMineral = function(resourceType, amount, maxPrice, energyPrice) {
  return buyMineral(resourceType, this.name, amount, maxPrice, energyPrice);
}

Room.prototype.energyPiles = function(minSize) {
  if (minSize == undefined) {
    minSize = 0;
  }
  const piles = this.find(FIND_DROPPED_RESOURCES, {
    filter: (i) => i.resourceType == RESOURCE_ENERGY && i.amount > minSize
  });
  return piles.length;
}

Room.prototype.energyInPiles = function() {
  const piles = this.find(FIND_DROPPED_RESOURCES, {
    filter: (i) => i.resourceType == RESOURCE_ENERGY
  });

  return piles.reduce(function(cost, part) {
    return cost + part.amount;
  }, 0);
}

function roomHeader(room) {
  if (room.memory.code) {
    //return `${room.name} (${room.memory.code})`;
    return `<a href = '${roomURL(room.name)}'>${room.name}</a> (${room.memory.code})`;
  } else {
    //return room.name;
    return `<a href = '${roomURL(room.name)}'>${room.name}</a>`;
  }
}

Room.prototype.logDebug = function(text) {
  if (this.memory.debug) {
    console.log(roomHeader(this) + ': ' + text);
  }
}

Room.prototype.logError = function(text) {
  console.log(roomHeader(this) + ': ' + text);
}

/**
 * List all 'unsecured' exits from the room, in the same format as Game.map.describeExits. An edge
 * is 'unsecured' if the room on the other side of it has more than one exit and isn't owned by
 * the same player.
 */
Room.prototype.unsecuredEdges = function() {
  let exits = Game.map.describeExits(this.name);

  let owner = Scout.baseOwner(this.name);

  for (let key in exits) {
    if (_.keys(Game.map.describeExits(exits[key])).length == 1) {
      delete exits[key];
    } else if (owner && owner == Scout.baseOwner(exits[key])) {
      delete exits[key];
    }
  }

  return exits;
}

Room.prototype.isHighway = function() {
  let parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(this.name);
  return isHighway = (parsed[1] % 10 === 0) || (parsed[2] % 10 === 0);
}

Room.prototype.lairOrder = function() {
  let lairs = this.find(FIND_HOSTILE_STRUCTURES, {
    filter: s => s.structureType == STRUCTURE_KEEPER_LAIR
  });

  // Compute distances from each lair to each other.
  for (let source = 0; source < 4; source++) {
    lairs[source].distances = [];
    for (let dest = 0; dest < 4; dest++) {
      let path = PathFinder.search(
          lairs[source].pos,
          [lairs[dest].pos],
          {
            maxRooms: 1,
            range: 1,
            roomCallback: function(roomName) {
              let room = Game.rooms[roomName];
              let costs = new PathFinder.CostMatrix;

              room.roads.forEach(function(struct) {
                costs.set(struct.pos.x, struct.pos.y, 1);
              });

              return costs;
            }
          });
      let distance = path.cost;
      lairs[source].distances.push(distance);
    }
  }

  // Find shortest path from lair 0, through all other nodes, and back to 0.
  let bestCost = Infinity;
  let bestPath = [];
  for (let first = 1; first < 4; first++) {
    for (let second = 1; second < 4; second++) {
      if (second == first) {
        continue;
      }
      for (let third = 1; third < 4; third++) {
        if (third == first || third == second) {
          continue;
        }

        let sum = lairs[0].distances[first] +
              lairs[first].distances[second] +
              lairs[second].distances[third] +
              lairs[third].distances[first];

        if (sum < bestCost) {
          bestCost = sum;
          bestPath = _.map([0, first, second, third], function(i) {return lairs[i].id});
        }
      }
    }
  }

  return bestPath;
}


Room.prototype.roadWorkNeeded = function() {
  const roads = _.filter(this.roads,
    s => s.hits < s.hitsMax && (!this.memory.noRepair || !this.memory.noRepair.includes(s.id)));

  return roads.reduce(function(cost, part) {
    return cost + (part.hitsMax - part.hits);
  }, 0);
}

/**
 * Returns the "bunker distance" between RoomPositions a and b. This is the
 * Chebyshev distance, plus 1 if the path is a pure diagonal. This plus-one bit
 * is because of the funny shape of bunkers.
 */
Room.prototype.bunkerDistance = function(pos) {
  if (this.baseType != 'bunker') {
    return;
  }

  let dx = Math.abs(this.bunkerCenter.x - pos.x);
  let dy = Math.abs(this.bunkerCenter.y - pos.y);
  let dist = Math.max(dx, dy);
  if (dist && dx == dy) {
    dist += 1;
  }

  return dist;
}

Room.prototype.census = function() {
  return _.filter(Game.creeps, c => c.memory.workRoom == this.name);
}

Room.prototype.orderNetResults = function() {
  let orders = (this.memory && this.memory.labs && this.memory.labs.orders) || [];
  return orderNetResults(orders);
}

Room.prototype.labDeficit = function(orders) {
  let roomInventory;
  let room = this;

  if (orders == undefined) {
    orders = (room.memory.labs && room.memory.labs.orders) || [];
    roomInventory = this.inventory;
  } else {
    roomInventory = this.inventoryNetOfLabs;
  }

  // Wait. Don't count what's in the factory. The basecourier won't pull from it.
  let adjustedInventory = _.clone(roomInventory);

  if (this.factory) {
    _.merge(adjustedInventory, this.factory.store, function(a,b) {return (a||0) - (b||0);});
  }

  let needs = orderNetResults(orders);

  needs = _.pick(needs, function(v) {return v > 0;});
  _.merge(needs, adjustedInventory, function(a,b) {return (a||0) - (b||0);});
  needs = _.pick(needs, function(v) {return v > 0;});
  return needs;
}

Room.prototype.reportEngagement = function(comment) {

  let lastEngagementTime = this.getLast('engagement', 0);

  const ENGAGEMENT_REPORT_PERIOD = 2000;
  if (lastEngagementTime + ENGAGEMENT_REPORT_PERIOD > Game.time) {
    return;
  }

  this.setLast('engagement', Game.time);
  EventLog.writeEntry(EventLog.ENGAGEMENT, this.name, comment);
}

Room.prototype.addLabOrder = function(resourceType, amount) {
  if (!amount) return ERR_INVALID_ARGS;
  let room = this;

  if (!room.memory.labs.orders) {
    room.memory.labs.orders = [];
  }
  if (!RESOURCES_ALL.includes(resourceType) || amount <= 0) {
    return ERR_INVALID_ARGS;
  }

  let orders = [{resourceType: resourceType, amount:amount}];

  let done;
  do {
    done = true;
    // If any of the ingredients for these orders are themselves
    // reaction products, and there aren't enough in the room, add
    // reaction orders.
    let deficit = room.labDeficit(orders);
    for (let input in deficit) {
      let recipe = RECIPES[input];
      if (!recipe) {
        // It's a base mineral. Leave it alone.
        continue;
      }

      // Queue an order for the deficit.
      let amount = Math.ceil(deficit[input] / 5) * 5;
      orders.unshift({resourceType: input, amount: amount});
      done = false;
    }
  } while (!done);

  room.memory.labs.orders = room.memory.labs.orders.concat(orders);

  return OK;
}
Room.prototype.addReverseLabOrder = function(resourceType, amount) {
  let room = this;

  if (!room.memory.labs.orders) {
    room.memory.labs.orders = [];
  }
  if (!RESOURCES_ALL.includes(resourceType) || amount <= 0) {
    return ERR_INVALID_ARGS;
  }

  room.memory.labs.orders.push({resourceType, amount, reverse: true})

  return OK;
}

/**
 * Returns an array of RoomPositions for all tiles in touch range of the controller that aren't
 * natural walls.
 */
Room.prototype.openTilesNearController = function() {
  if (!this.controller) {
    return [];
  }

  let neighbors = [];
  for (let direction = 1; direction <= 8; direction++) {
    neighbors.push(this.controller.pos.oneStep(direction));
  }

  return _.filter(neighbors, 'open');
}

/**
 * Returns an array of RoomPositions for all tiles in touch range of the controller that are
 * walkable by my units.
 */
Room.prototype.walkableTilesNearController = function() {
  if (!this.controller) {
    return [];
  }

  return _.filter(this.openTilesNearController(), n => n.isWalkable());
}

/**
 * Returns an array of RoomPositions for all tiles in touch range of the controller that are
 * walkable by my units.
 */
Room.prototype.nakedWalkableTilesNearController = function() {
  if (!this.controller) {
    return [];
  }

  return _.filter(this.openTilesNearController(), n => n.isWalkable() && !n.hasRampart());
}

Room.prototype.weakestScaledRampart = function() {
  let weakestCrit = this.weakestCriticalWall;
  let weakestKeep = this.weakestKeepRampart;
  let weakestRamp = this.weakestOnRamp;
  let weakestGallery = this.weakestGallery;
  let weakestStub = this.weakestStubRamparts;

  let weakest =
      _.min([weakestCrit, weakestKeep, weakestRamp, weakestGallery, weakestStub], 'scaledHits');
  return weakest;
}

Room.prototype.newHostileBasesForbidden = function() {
  let nearestBase = Nav.getNearestBaseManhattan(this.name);
 
  if (nearestBase && Nav.getRoomDistanceManhattan(this.name, nearestBase.name) < 3) {
    return `Too near to ${nearestBase.name}`;
  }

  let xy = Nav.roomNameToXY(this.name)
  if (this.sector.name == 'E55N5' && xy[1] > -6) return false;

  if (this.sector.name == 'W35S15' && xy[1] > -6) return `holy sector`;

  if (this.sector.myBases.length > 2) return `my sector`;

  if (this.sector.name == 'E45N35' && xy[1] > -37) return `Aundine's sector but I can reach`;

  return false;
}

Room.prototype.getLast = function(key, defaultValue) {
  return _.get(this.memory, `_last.` + key, defaultValue);
}

Room.prototype.setLast = function(key, value) {
  return _.set(this.memory, `_last.` + key, value);
}