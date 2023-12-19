'use strict';

let Alert = require('util_alert');
let Unit = require('units_unit');

exports.reindexCreeps = function() {
  for (let i in Game.flags) {
    let flag = Game.flags[i];
    flag.creeps = {};
  }

  for (let i in Game.rooms) {
    let room = Game.rooms[i];
    room.ownedCreeps = [];
    room.myCreeps = [];
    room.myPowerCreeps = [];
    room.sessileCreeps = {};
    room.woundedCreeps = [];
    room.basecouriers = [];
    room.upgraders = [];
  }

  Game.units = {};
  Game.claimers = [];
  Game.preUpdateCreeps = [];

  let oldCreepPositions = Memory._oldCreepPositions || {};
  let newCreepPositions = {};

  for (let i in Game.creeps) {
    let creep = Game.creeps[i];

    newCreepPositions[creep.id] = creep.pos;
    if (oldCreepPositions[creep.id]) {
      creep.previousPos = new RoomPosition(
          oldCreepPositions[creep.id].x,
          oldCreepPositions[creep.id].y,
          oldCreepPositions[creep.id].roomName);
    }
    
    creep.room.myCreeps.push(creep);

    creep.incomingHeal = 0;
    creep.minDamage = 0;
    creep.likelyRawDamage = 0;
    creep.maxRawDamage = 0;

    if (['longhauler', 'digger', 'loader'].includes(creep.memory.role)) {
      if (['digger', 'loader'].includes(creep.memory.role) && !creep.spawning) {
        creep.room.sessileCreeps[i] = creep;
      }
    } else if (creep.memory.role == 'crane') {
      if (creep.memory.subRole == 'storage') {
        creep.room.storageCrane = creep;
      }
      if (!creep.spawning) {
        creep.room.sessileCreeps[i] = creep;
      }
    } else if (creep.memory.role == 'basecourier') {
      creep.room.basecouriers.push(creep);
    } else if (creep.memory.role == 'claimer') {
      Game.claimers.push(creep);
    } else if (creep.memory.role == 'upgrader') {
      creep.room.upgraders.push(creep);
      if (!creep.spawning) {
        creep.room.sessileCreeps[i] = creep;
      }
    } else if (creep.memory.role == 'appendage') {
      if (['miner', 'upgrader'].includes(creep.memory.subRole)) {
        creep.room.sessileCreeps[i] = creep;
      }
    }

    if (creep.hits < creep.hitsMax) {
      creep.room.woundedCreeps.push(creep);
    }

    if (creep.memory.unit) {
      let unitId = creep.memory.unit;
      if (!Game.units[unitId]) {
        Unit.initializeUnit(unitId);
      }

      Game.units[unitId].elements.push(creep);
      creep.unit = Game.units[unitId];
    }

    let flag = Game.flags[creep.memory.flagName];
    if (flag) {
      flag.creeps[i] = creep;
      creep.flag = flag;
    }

    let workRoom = Game.rooms[creep.memory.workRoom];
    if (workRoom) {
      workRoom.ownedCreeps.push(creep);
      creep.workRoom = workRoom;
    }
    
    if (creep.needsPreUpdate()) {
      Game.preUpdateCreeps.push(creep);
    }
  }

  for (let i in Game.powerCreeps) {
    let creep = Game.powerCreeps[i];

    newCreepPositions[creep.id] = creep.pos;
    
    creep.incomingHeal = 0;
    creep.minDamage = 0;
    creep.likelyRawDamage = 0;
    creep.maxRawDamage = 0;

    if (creep.room) {
      creep.room.myPowerCreeps.push(creep);
    }

    if (creep.hits < creep.hitsMax) {
      creep.room.woundedCreeps.push(creep);
    }
  }

  Memory._oldCreepPositions = newCreepPositions;
}

function runCreeps(creeps) {
  if (!creeps) {
    return;
  }
  const ti = Game.cpu.getUsed();
  for (let i=0; i < creeps.length; i++) {
    let creep = creeps[i];
    try {
      let tic = Game.cpu.getUsed();
      creep.execute();
      let tif = Game.cpu.getUsed();
      creep.memory._lifetimeCpu = (creep.memory._lifetimeCpu || 0) + (tif - tic);
    } catch (err) {
      console.log(creep.name + ' at ' + creep.pos.link + ' caught err=' + err + ' state=' +
          creep.memory.state + ' subState=' + creep.memory.subState);
    }
  }
  const tf = Game.cpu.getUsed();
  Memory.profile.byRole[creeps[0].memory.role] = {
    totalTime: _.round(tf - ti, 2),
    n: creeps.length,
    mean: _.round((tf - ti) / creeps.length, 3)
  };
}

function repairAmnesiacs(amnesiacs) {
  for (let i=0; i < amnesiacs.length; i++) {
    let creep = amnesiacs[i];
    creep.logArrival();

    if (!creep.memory.role) {
      creep.logError(`Auto-recovering from anmesia.`);
      let role = /[A-Za-z]*/.exec(creep.name.toLowerCase())[0];
      let nearestTerminal = creep.pos.findClosestTerminal();
      creep.memory.role = role;
      creep.memory.workRoom = (nearestTerminal && nearestTerminal.room.name) || creep.room.name;
      creep.memory.state = STATE_AMNESIAC;
      creep.memory.subState = 0;
    }
  }
}

exports.preUpdateAllCreeps = function() {
  if (!Game || !Game.preUpdateCreeps || !Game.preUpdateCreeps.length) {
    return;
  }

  _.forEach(Game.preUpdateCreeps, function(creep) {
    try {
      creep.preUpdate();
    } catch (err) {
      creep.logError(`preUpdate error: ${err}`);
    }
  });
}

exports.runAllCreeps = function() {
  let creepsByRole = _.groupBy(Game.creeps, 'memory.role');

  if (creepsByRole.undefined) {
    repairAmnesiacs(creepsByRole.undefined);
  }

  for (let key of creepExecutionOrder.keys()) {
    runCreeps(creepsByRole[key]);
  }
}

exports.runAllPowerCreeps = function() {
  for (let key of _.keys(Game.powerCreeps)) {
    let creep = Game.powerCreeps[key];
    try {
      creep.execute();
    } catch (err) {
      console.log(creep.name + ' at ' + creep.pos.link + ' caught err=' + err + ' state=' +
          creep.memory.state + ' subState=' + creep.memory.subState);
    }
  }
}

exports.setRoomGlobals = function() {
  for (let base of Game.bases) {
    if (base.memory.code) {
      global[base.memory.code] = base;
    }
  }
}

function shiftMineralInit() {
  Game._eligibleSenders = _.compact(_.filter(
      Game.terminalBases,
      r => r.activeTerminal &&
          !r.terminal.cooldown &&
          !r.terminal.busy &&
          !r.terminal.servingController));

  Game._factorySenders = _.compact(_.filter(
      Game.factoryBases,
      r => r.activeTerminal &&
          !r.terminal.cooldown &&
          !r.terminal.busy &&
          !r.terminal.servingController));
}

function shiftMineral(resourceType, idealAmount, minToSend) {
  if (minToSend < 1) {
    return ERR_INVALID_ARGS;
  }

  let isFactoryResource = COMMODITIES[resourceType] && COMMODITIES[resourceType].level;
  
  let eligibleSenders = _.compact(_.filter(
    isFactoryResource ? Game._factorySenders : Game._eligibleSenders,
    r => r.terminal.store[resourceType] >= minToSend && !r.terminal.busy));

  if (!eligibleSenders.length) {
    return;
  }

  function canReceive(room) {
    if (!room.resourceLimits[resourceType]) {
      return false;
    }

    if (room.memory.shutdown) {
      return false;
    }

    if (room.roughInventory(resourceType) >= idealAmount) {
      return false;
    }

    if (room.terminal.incoming || room.terminal.mineralsIncoming) {
      return false;
    }

    if (room.labs && room.labs.length && !room.terminal.servingController) {
      return true;
    }

    if (room.terminal &&
      room.terminal.servingController &&
      room.memory.serveController &&
      room.memory.serveController.state == 'cleanup') {
      return false;
    }

    if (['XGH2O', 'XLH2O'].includes(resourceType)) {
      return true;
    }

    return false;
  }

  let eligibleReceivers = _.compact(_.filter(
      isFactoryResource ? Game.factoryBases : Game.terminalBases,
      r => canReceive(r)));
      
  if (!eligibleReceivers.length) {
    return;
  }

  // Find the base with the least resource.
  let roomAmount = function(room) {
    return room.roughInventory(resourceType);
  }

  let leastBase = _.min(eligibleReceivers, roomAmount);
  
  let leastBaseAmount = roomAmount(leastBase);
  
  //console.log(`${leastBase.name} has the least ${resourceType} with ${leastBaseAmount}`);

  if (leastBaseAmount >= idealAmount) {
    console.log('Done because all bases have enough. (I assert that this should never happen)');
    return;
  }
  
  // Find the base with the most resource.
  let mostBase = _.max(eligibleSenders, roomAmount);
  
  let mostBaseAmount = roomAmount(mostBase);
  
  //console.log(`${mostBase.name} has the most ${resourceType} with ${mostBaseAmount}`);

  if (mostBaseAmount <= idealAmount) {
    //console.log('Done because no base has excess.')
    return;
  }

  if (mostBase.terminal.busy || mostBase.terminal.cooldown) {
    //console.log(`Done because sender terminal is busy. (${mostBase.terminal.cooldown}).`);
    return;
  }
  
  let mostBaseExcess = mostBaseAmount - idealAmount;
  
  let leastBaseNeeded = idealAmount - leastBaseAmount;
  
  let leastBaseRoom = leastBase.terminal.storeCapacity - _.sum(leastBase.store);
  
  let amountToSend = Math.min(
    mostBase.terminal.store[resourceType] || 0,
    mostBaseExcess,
    leastBaseNeeded,
    leastBaseRoom);
    
  if (amountToSend < minToSend) {
    //console.log('Done because the amount to send is too small.');
    return;
  }

  let costToSend = Game.market.calcTransactionCost(
    amountToSend,
    leastBase.name,
    mostBase.name);
    
  let necessarySenderEnergy = costToSend +
    (resourceType == RESOURCE_ENERGY ? amountToSend : 0);

  if (necessarySenderEnergy > mostBase.terminal.store.energy) {
    //console.log('Done because sender terminal has insufficient energy.');
    return;
  }

  mostBase.logDebug(`===> Sending ${amountToSend} ${resourceType} (of ${mostBaseAmount}) to ` +
      `${leastBase.memory.code} ${leastBase.link} (${leastBaseAmount})`);
  let result = mostBase.terminal.mySend(resourceType, amountToSend, leastBase.name);
  
  if (result != OK) {
    mostBase.logDebug(`Failed to send ${amountToSend} ${resourceType} (of ${mostBaseAmount}) to ` +
      `${leastBase.memory.code} ${leastBase.link} (${leastBaseAmount})`);
    console.log('costToSend =' + costToSend);
    console.log(`result = ${result}`);
  }
}

// General smoother. Send from whoever has the most to whoever has the least.
exports.shiftMinerals = function() {
  if (ticksSinceReset() < 10) return;

  if ((Game.time & 15) == 11) {
    shiftMineralInit();
    shiftMineral(RESOURCE_SWITCH, 200, 100);
    shiftMineral(RESOURCE_TRANSISTOR, 50, 5);
    shiftMineral(RESOURCE_MICROCHIP, 6, 1);
    shiftMineral(RESOURCE_CIRCUIT, 4, 1);
  }

  if ((Game.time & 15) == 13) {
    shiftMineralInit();
    shiftMineral(RESOURCE_PHLEGM, 200, 100);
    shiftMineral(RESOURCE_TISSUE, 20, 1);
    shiftMineral(RESOURCE_MUSCLE, 10, 1);
    shiftMineral(RESOURCE_ORGANOID, 4, 1);
  }

  if ((Game.time & 150) == 0) {
    shiftMineralInit();
    shiftMineral(RESOURCE_BATTERY, 25000, 1000);

    let totalPower = _.sum(Game.terminalBases, b => b.roughInventory('power'));

    let meanPower = totalPower / (Game.terminalBases.length || 1);
    let idealPower = (Math.floor(meanPower / 1000) * 1000) || 1000;
    idealPower = Math.min(45000, idealPower);
    shiftMineral(RESOURCE_POWER, idealPower, 4000);

    let totalOps = _.sum(Game.terminalBases, b => b.roughInventory(RESOURCE_OPS));
    let powerBases = _.filter(Game.terminalBases, b => b.controller.isPowerEnabled);

    let meanOps = totalOps / (powerBases.length || 1);
    let idealOps = (Math.floor(meanOps / 1000) * 1000) || 1000;
    idealOps = Math.min(idealOps, 25000);
    shiftMineral(RESOURCE_OPS, idealOps, 1000);
  }
}

exports.reindexConstructionSites = function() {
  for (let i in Game.constructionSites) {
    let site = Game.constructionSites[i];

    if (!site.room) {
      continue;
    }

    if (!site.room._constructionSites) {
      site.room._constructionSites = [];
    }

    site.room._constructionSites.push(site);
  }
}

exports.checkConstructionSites = function() {
  for (let key in Memory.previousConstructionSites) {
    if (Game.constructionSites[key]) {
      continue;
    }

    let site = Memory.previousConstructionSites[key];

    let roomName = site.pos.roomName;
    let room = Game.rooms[roomName];

    if (!room) {
      // Probably just lost visibility. not interesting.
      continue;
    }

    // Look for the new thing.
    let structuresAtTheSite = room.lookForAt(LOOK_STRUCTURES, site.pos.x, site.pos.y);

    let newThing = _.find(structuresAtTheSite, s => s.structureType == site.structureType);

    if (!newThing) {
      // Still have visibility, but the construction site is gone and no corresponding structure is
      // there. Weird. Maybe it got stomped. Maybe it was removed. Either way, not interesting.
      continue;
    }

    if (newThing.structureType == STRUCTURE_RAMPART) {
      room.checkRampart(newThing);
    }
  }
}

exports.handleUnfilledSpawnJobs = function() {
  let backlog = {note: 'computed in main.util'};
  
  for (let key in Memory.spawnJobs) {
    let job = Memory.spawnJobs[key];
    
    for (let i = 0; i < job.rooms.length; i++) {
      let roomName = job.rooms[i];
      let bodyParts = job.body.length;
      backlog[roomName] = (backlog[roomName] || 0) + bodyParts;
    }
  }
  
  Memory.spawnBacklog = backlog;
}

exports.savePreviousConstructionSites = function() {
  Memory.previousConstructionSites = {};

  for (let id in Game.constructionSites) {
    let site = Game.getObjectById(id);
    let pos = site.pos;
    let structureType = site.structureType;
    Memory.previousConstructionSites[id] = {pos, structureType};
  }
}

const MAX_DAILY_SEND = 200000;
const SEND_ROOM = 'E28N22';

exports.shipPowerToAundine = function() {
  if (!Game.rooms[SEND_ROOM] ||
      !Game.rooms[SEND_ROOM].terminal ||
      _.sum(Game.rooms[SEND_ROOM].terminal.store) > 295000 ||
      !Game.rooms[SEND_ROOM].storage ||
      _.sum(Game.rooms[SEND_ROOM].storage.store) > 900000) {
    return;
  }

  let currentDate = new Date().getDate();
  if (!Memory.shipped || Memory.shipped.date != currentDate) {
    console.log(`Initializing Memory.shipped`);
    Memory.shipped = {date: currentDate, amount:0};
  }

  if (Memory.shipped.amount >= MAX_DAILY_SEND) return;

  let eligibleBases = _.filter(
      Game.terminalBases,
      b => b.terminal &&
          !b.terminal.busy &&
          !b.terminal.cooldown &&
          b.terminal.store[RESOURCE_POWER] >= 5000 &&
          b.terminal.store[RESOURCE_ENERGY] > 5000 &&
          b.roughInventory(RESOURCE_POWER) > 5000);

  if (!eligibleBases.length) return;

  let base = _.min(eligibleBases, b => Game.map.getRoomLinearDistance(b.name, SEND_ROOM, true));

  if (!base) return;

  if (base.terminal.mySend(RESOURCE_POWER, 5000, SEND_ROOM) != OK) return;
  Memory.shipped.amount += 5000;
  //base.logError(`Shipping 5000 power to Aundine (${Memory.shipped.amount}/${MAX_DAILY_SEND})`);
}

const MAX_DAILY_SEND_DR = 100000;
const SEND_ROOM_DR = 'E42N43';

exports.shipEnergyToDrckongen = function() {
  
  if (Memory.shippedDr && Memory.shippedDr.timestamp > Game.time - 100) return;

  let currentDate = new Date().getDate();
  if (!Memory.shippedDr || Memory.shippedDr.date != currentDate) {
    console.log(`Initializing Memory.shippedDr`);
    Memory.shippedDr = {date: currentDate, amount:0};
  }

  if (Memory.shippedDr.amount >= MAX_DAILY_SEND_DR) return;

  let eligibleBases = _.filter(
      Game.terminalBases,
      b => b.terminal &&
          !b.terminal.busy &&
          !b.terminal.cooldown &&
          b.terminal.store[RESOURCE_ENERGY] > 50000 &&
          b.roughInventory(RESOURCE_ENERGY) > 500000);

  if (!eligibleBases.length) return;

  let base = _.min(eligibleBases, b => Game.map.getRoomLinearDistance(b.name, SEND_ROOM, true));

  if (!base) return;

  if (base.terminal.mySend(RESOURCE_ENERGY, 5000, SEND_ROOM_DR) != OK) return;
  Memory.shippedDr.amount += 5000;
  Memory.shippedDr.timestamp = Game.time;
  base.logError(`Shipping 5000 energy to drckongen at ${roomNameLink('E42N43')} ` +
      `(${Memory.shippedDr.amount}/${MAX_DAILY_SEND_DR})`);
}

exports.shipOxygenToDeadfeed = function(receiver) {
  shipOxygenToDeadfeedRoom('E24N39', 'E41N27');
  shipOxygenToDeadfeedRoom('E28N29', 'E41N27');
  shipOxygenToDeadfeedRoom('E22N32', 'E41N27');
}

function shipOxygenToDeadfeedRoom(senderName, receiverName) {
  let sender = Game.rooms[senderName];
  let receiver = Game.rooms[receiverName];

  if (!sender ||
      !receiver ||
      !receiver.terminal ||
      !receiver.controller ||
      receiver.controller.level < 6 ||
      !sender.activeTerminal ||
      sender.activeTerminal.cooldown ||
      receiver.terminal.store.getFreeCapacity() < 1000 ||
      sender.roughInventory(RESOURCE_OXYGEN) < 12000 ||
      sender.terminal.store[RESOURCE_OXYGEN] < 3000 ||
      sender.roughEnergy < 200000) {
    return;
  }

  let amountToSend = Math.min(10000, receiver.terminal.store.getFreeCapacity());

  if (amountToSend < 1000) return;

  sender.logError(`Sending ${amountToSend} Oxygen to ${receiverName}}`);
  sender.activeTerminal.send(RESOURCE_OXYGEN, amountToSend, receiverName);
}

exports.shipEnergyToDeadfeed = function(receiver) {
  shipEnergyToDeadfeedRoom('E51N9', 'E51N3');
}

function shipEnergyToDeadfeedRoom(senderName, receiverName) {
  let sender = Game.rooms[senderName];
  let receiver = Game.rooms[receiverName];

  if (!sender ||
      !receiver ||
      !receiver.terminal ||
      !receiver.controller ||
      receiver.controller.level < 6 ||
      !sender.activeTerminal ||
      sender.activeTerminal.cooldown ||
      receiver.roughEnergy > 80000 ||
      sender.roughEnergy < 200000) {
    return;
  }

  if (receiver.controller.level == 8 &&
      receiver.controller.ticksToDowngrade > 50000 &&
      receiver.roughEnergy > 50000) {
    return;
  }

  let free  = receiver.terminal.store.getFreeCapacity();
  let amountToSend = Math.min(20000, free - 2500);

  if (amountToSend < 2500) return;

  sender.activeTerminal.send(RESOURCE_ENERGY, amountToSend, receiverName);
}

exports.getForeignShards = function() {
  let otherShardNames = _.difference(_.keys(Game.cpu.shardLimits), [Game.shard.name]);

  Game.interShardMemory = {};
  for (let shard of otherShardNames) {
    Game.interShardMemory[shard] = JSON.parse(InterShardMemory.getRemote(shard) || '{}');
  }
}

exports.setShardLocal = function() {
  if (Memory.shardLocal) {
    InterShardMemory.setLocal(JSON.stringify(Memory.shardLocal));
  }
}

exports.clearArrivalsAndDepartures = function() {
  if (Game.time % 10) {
    return;
  }

  // Delete any departures that have a corresponding arrival entry on another shard.
  if (Memory.shardLocal && Memory.shardLocal.departures) {
    for (let shard in Memory.shardLocal.departures) {
      for (let key in Memory.shardLocal.departures[shard]) {
        if (Game.interShardMemory[shard] &&
            Game.interShardMemory[shard].arrivals &&
            Game.interShardMemory[shard].arrivals[Game.shard.name] &&
            Game.interShardMemory[shard].arrivals[Game.shard.name][key]) {
          delete Memory.shardLocal.departures[shard][key];
        }
      }
    }
  }

  // Delete any arrivals that don't have a corresponding departure entry on another shard.
  if (Memory.shardLocal && Memory.shardLocal.arrivals) {
    for (let shard in Memory.shardLocal.arrivals) {
      for (let key in Memory.shardLocal.arrivals[shard]) {
        if (!Game.interShardMemory[shard] ||
            !Game.interShardMemory[shard].departures ||
            !Game.interShardMemory[shard].departures[Game.shard.name] ||
            !Game.interShardMemory[shard].departures[Game.shard.name][key]) {
          delete Memory.shardLocal.arrivals[shard][key];
        }
      }
    }
  }
}

function getRoomNameToBrick() {
  return _.find(_.keys(Memory.rooms), k  => Memory.rooms[k].brickMe);
}

function tooLongUnscanned(roomName) {
  let mem = Memory.rooms[roomName];
  if (!mem ||
      mem._nextScan > Game.time - 10000 ||
      mem.noFarm) {
    return false;
  }

  return true;
}

global.foo = function() {
  return checkLongAgoScanTimes();
}

function checkLongAgoScanTimes() {
  // Check for long-ago nextScan times. Such rooms need some manual attention.
  let longAgo = _(Memory.rooms)
      .keys()
      .filter(k => tooLongUnscanned(k))
      .value();

  if (longAgo.length) {
    let key = Alert.Key.LONGAGO_NEXT_SCAN;
    let message = `Room(s) ${longAgo} have got long-ago nextScan times.`;
    console.log(message);
    Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);
  }

  return OK;
}

exports.doInfrequentGlobalChecks = function() {
  deleteRoomMemory();

  if ((Game.time & 4095) == 1234) {
    checkLongAgoScanTimes();
  }

  if ((Game.time & 2047) == 234) {
    // Maybe brick a room?
    let numBricks = _.filter(Game.rooms, 'memory.brick').length;
    if (Game.gcl.level > Game.bases.length + 1 && numBricks < 3) {
      let roomNameToBrick = getRoomNameToBrick();

      if (roomNameToBrick) {
        if (OK == brickRoom(roomNameToBrick)) {
          Game.notify(`Started bricking ${roomNameToBrick}.`);
          delete Memory.rooms[roomNameToBrick].brickMe;
        }
      }
    }
  }

  if (((Game.time & 15) == 3) && (Game.vaults.length > 1)) {
    // maybe balance vaults
    for (let source of Game.vaults) {
      for (let dest of Game.vaults) {
        if (source == dest) continue;
        if (!source.activeTerminal ||
            !source.activeStorage ||
            source.terminal.cooldown ||
            source.roughEnergy < 100000 ||
            !source.activeTerminal ||
            !dest.activeStorage) continue;
        balanceVault(source, dest);
      }
    }
  }
}

const NO_BALANCE_RESOURCES = [RESOURCE_BIOMASS, RESOURCE_SILICON, RESOURCE_WIRE, RESOURCE_CELL];

function balanceVault(source, dest) {
  // look for a thing in the vault such that source room has at at least double the amount that dest room has, and
  // source room has at least as much in storage as it does in the terminal.
  for (let key of _.keys(source.terminal.store)) {
    if (NO_BALANCE_RESOURCES.includes(key)) continue;
    if (source.storage.store[key] >= source.terminal.store[key]) {
      if (source.roughInventory(key) > 2 * dest.roughInventory(key) ||
          source.roughInventory(key) > 200000 + dest.roughInventory(key)) {
        source.terminal.mySend(key, source.terminal.store[key], dest.name, "vaultBalance");
        return;
      }
    }
  }
}

function storeAdd(a, b) {
  return (a || 0) + (b || 0);
}

exports.updateBaseDetail = function() {
  if (!Memory.longTermBaseDetail) Memory.longTermBaseDetail = {n: 0};

  Memory.longTermBaseDetail =
      _.merge(Memory.longTermBaseDetail, Memory.profile.baseDetail, storeAdd);
  Memory.longTermBaseDetail.linkWaste = (Memory.longTermBaseDetail.linkWaste || 0) +
      Memory.profile.baseDetail.doLinkTransfers - 0.2 * (Game.linkIntents || 0);
  Memory.longTermBaseDetail.observeWaste = (Memory.longTermBaseDetail.observeWaste || 0) +
      Memory.profile.baseDetail.observe - 0.2 * (Game.observerIntents || 0);
  Memory.longTermBaseDetail.towerWaste = (Memory.longTermBaseDetail.towerWaste || 0) +
      Memory.profile.baseDetail.maintainRoadsAndContainers - 0.2 * (Game.towerIntents || 0);
  Memory.longTermBaseDetail.periodics = (Memory.longTermBaseDetail.periodics || 0) +
      Memory.profile.periodics - Memory.profile.buyPower;
  Memory.longTermBaseDetail.n += 1;
}

let _roomsToDelete = [];

exports.markRoomMemoryForDelete = function(roomName) {
  if (!roomName.isValidRoomName()) {
    return ERR_INVALID_ARGS;
  }

  if (!Memory.rooms[roomName]) return;

  // Set safety.
  Memory.rooms[roomName]._deleteMe = true;

  _roomsToDelete.push(roomName);
}

function deleteRoomMemory() {
  let newList = [];
  for (let roomName of _roomsToDelete) {
    if (!roomName.isValidRoomName()) continue;

    if (!Memory.rooms[roomName]) continue;

    // Wait if the room is visible. Deleting it won't work.
    if (Game.rooms[roomName]) {
      newList.push(roomName);
      continue;
    }

    // Safety check.
    if (!Memory.rooms[roomName]._deleteMe) {
      console.log(`Room ${roomName} made it onto _roomsToDelete without _deleteMe set.`);
      continue;
    }

    console.log(`Deleting Memory.rooms[${roomName}]`);
    delete Memory.rooms[roomName];
  }

  _roomsToDelete = newList;
}