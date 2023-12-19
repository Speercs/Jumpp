'use strict';

let Alert = require('util_alert');
let Guardian = require('role_guardian');
let SpawnJob = require('util_spawnJob');
let Miner = require('role_miner');
let Wagon = require('role_wagon');

function update(room) {
  try {
    updateImpl(room);
  } catch (err) {
    room.logError(`(deposits) Error: ${err}`);
  }
}

function updateImpl(room) {
  if (room.memory.noFarm) {
    delete room.memory.deposits;
    return;
  }

  let deposits = room.find(FIND_DEPOSITS);

  for (let deposit of deposits) {
    updateDeposit(deposit);
  }

  if (!room.memory.deposits) {
    return;
  }

  for (let key in room.memory.deposits) {
    if (!Game.getObjectById(key)) {
      delete room.memory.deposits[key];
    }
  }

  if (!_.keys(room.memory.deposits).length) {
    delete room.memory.deposits;
  }
}

let _numMiners = {};

function numMiners() {
  if (!_numMiners || !_numMiners.timestamp || (_numMiners.timestamp != Game.time)) {
    _numMiners = {
        timestamp: Game.time,
        count: _.filter(Game.creeps, c => c.memory.role == 'miner').length
    };
  }

  return _numMiners.count;
}

function updateDeposit(deposit) {
  let room = deposit.room;

  if (!room.memory.deposits) {
    room.memory.deposits = {};
  }

  if (!room.memory.deposits[deposit.id]) {
    let returnData = {};
    let nearestTerminal = deposit.pos.findClosestTerminal({minRCL: 8, returnData: returnData});
    room.memory.deposits[deposit.id] = {
        pos: deposit.pos,
        base: (nearestTerminal && nearestTerminal.room.name) || 'none',
        pathCost: returnData.cost || Infinity,
        depositType: deposit.depositType,
    };
  }

  let mem = room.memory.deposits[deposit.id];

  mem.lastCooldown = deposit.lastCooldown;
  mem.expiry = Game.time + deposit.ticksToDecay;

  orderWagons(deposit);

  orderGuardians(deposit);

  if (Game.cpu.bucket < FULL_BUCKET_CPU * 10/20) return;

  if (Game.cpu.bucket < FULL_BUCKET_CPU * 16/20 && numMiners() > 4) return;

  if (deposit.lastCooldown > 120 || deposit.ticksToDecay < 1500) {
    return;
  }
  
  if (deposit.lastCooldown > 90 && deposit.ticksToDecay < 30000) {
    return;
  }

  let vault = room.nearestVault;
  if (vault &&
      (deposit.lastCooldown > 90 || mem.pathCost > 180) &&
      vault.roughInventory(deposit.depositType) > 500000) {
    return;
  }

  if (vault && vault.roughInventory(deposit.depositType) > 1000000) {
    return;
  }

  if (!room.memory.farmDeposits && mem.pathCost > 225) {
    if (mem.pathCost < 225) {
      let key = room.name + Alert.Key.UNUSED_DEPOSIT;
      let message = `room ${room.link} has a deposit with pathCost ${mem.pathCost}`;
      Alert.notify(Alert.Destination.CONSOLE, key, 1000, message);
    }
    return;
  }

  orderMiners(deposit);
}

let lastMinerOrderTime = 0;

const MINER_SPAWN_RATELIMIT = 30;

function orderMiners(deposit) {
  // Ratelimit. Request no more than one miner per tick.
  if (Game.time == lastMinerOrderTime) return;

  // Ratelimit. Request no miner if one has been successfully spawned recently.
  if (Memory._lastMinerSpawn + MINER_SPAWN_RATELIMIT > Game.time) return;

  let room = deposit.room;
  if (!room) return;
  let vault = room.nearestVault;

  let boostedGuardians = _.filter(room.myCreeps, c => c.memory.role == 'guardian' && c.boosted).length > 0;

  // Strongly prefer biomass to silicon?
  if (vault &&
      vault.storage &&
      !boostedGuardians &&
      (vault.storage.store.L > vault.storage.store.U + 200000 ||
          vault.storage.store.lemergium_bar > vault.storage.store.utrium_bar + 100000) &&
      deposit.depositType != RESOURCE_BIOMASS &&
      Memory._lastMinerSpawn + MINER_SPAWN_RATELIMIT + 100 > Game.time) {
    return;
  }

  // Strongly prefer silicon to biomass?
  if (vault &&
      vault.storage &&
      !boostedGuardians &&
      (vault.storage.store.U > vault.storage.store.L + 200000 ||
        vault.storage.store.utrium_bar > vault.storage.store.lemergium_bar + 100000) &&
    deposit.depositType != RESOURCE_SILICON &&
      Memory._lastMinerSpawn + MINER_SPAWN_RATELIMIT + 100 > Game.time) {
    return;
  }

  let mem = room.memory.deposits[deposit.id];

  if (!mem.base) {
    return;
  }

  // Don't order if there are hostile fighters in the room.
  if (room.hostilePlayerCreeps.length) return;
  
  let myMiners = _.filter(
      room.ownedCreeps,
      c => c.memory.role == 'miner' &&
          c.memory.target == deposit.id &&
          c.totalTicksToLive > 150 + mem.pathCost);
  
  if (myMiners.length) {
    return;
  }

  let sourceRooms = [mem.base];
  let model = 1;

  room.logDebug(`Requesting a miner.`);
  if (Miner.requestSpawnRoom(sourceRooms, model, deposit, SpawnJob.PRIORITY_DEFAULT) == OK) {
    lastMinerOrderTime = Game.time;
  }
}

function orderWagons(deposit) {
  let room = deposit.room;
  let mem = room.memory.deposits[deposit.id];

  // Don't order wagons unless miners exist.
  let myMiners = _.filter(
      room.ownedCreeps,
      c => c.memory.role == 'miner' && c.memory.target == deposit.id && c.totalTicksToLive > 300);

  if (!myMiners.length) {
    return;
  }

  let myWagons = _.filter(
      room.ownedCreeps,
      c => c.memory.role == 'wagon' && c.memory.depositId == deposit.id);

  let minersOnStation = deposit.pos.findInRange(myMiners, 1);
  let harvestPowerOnStation = _.sum(minersOnStation, 'harvestPower');
  let depositHarvestPower = harvestPowerOnStation * HARVEST_DEPOSIT_POWER / HARVEST_POWER;

  // Make this simpler. Always 2 wagons. At least 100 ticks apart. If the cooldown is 
  let estimatedTimeToFillAWagon = 1250 / depositHarvestPower * (mem.lastCooldown + 4);
  let wagonLagTime = Math.min(900, Math.max(estimatedTimeToFillAWagon, 390))
  if (myWagons.length) {
    let youngest = _.max(myWagons, 'totalTicksToLive');

    if (youngest && youngest.totalTicksToLive > CREEP_LIFE_TIME - wagonLagTime) return;
  }

  if (myWagons.length >= 2) {
    return;
  }

  let sourceRooms = [mem.base];
  let model = 1; // test, real one is 1

  Wagon.requestSpawnRoom(sourceRooms, model, deposit, SpawnJob.PRIORITY_DEFAULT);
}

function orderGuardians(deposit) {
  if (deposit.lastCooldown > 120) return;

  let room = deposit.room;

  if (!room.hostileCreeps.length) return;

  let enemyMine = _.find(room.hostileCreeps, c => c.harvestPower && c.pos.getRangeTo(deposit) < 3);

  // Bail if there's no enemy miner on site, and we haven't seen one in at least 50k ticks.
  if (!enemyMine && !(room.memory._lastHostileMiner < Game.time + 50000)) return;

  room.memory._lastHostileMiner = Game.time;

  let guard = _.find(
    room.ownedCreeps,
    c => c.memory.role == 'guardian' &&
        c.totalTicksToLive > 300 &&
        c.memory.workRoom == room.name);

  if (guard) return;

  let guardianModel = room.memory.guardianModel || 2;

  let result = Guardian.requestSpawnRoom(
    [room.memory.deposits[deposit.id].base],
    guardianModel,
    room.name,
    SpawnJob.PRIORITY_HIGH);
  if (result != OK) {
    room.logError('Failed to spawn Guardian:' + result);
  }
}

global.depositReport = function(onlyWorked = false) {
  let rooms = _(Memory.rooms).keys().filter(k => Memory.rooms[k].deposits).value();

  console.log(`  room  `, `  type  `, ` cost `, ` decay `, ` cool `, ` miners `);

  for (let roomName of rooms) {
    if (Memory.rooms[roomName].noFarm && Memory.rooms[roomName].deposits) {
      console.log(`Deleting deposits record from noFarm room ${roomName}`);
      delete Memory.rooms[roomName].deposits;
      continue;
    }
    for (let key in Memory.rooms[roomName].deposits) {
      let mem = Memory.rooms[roomName].deposits[key];
      let miners = _.filter(Game.creeps, c => c.memory.role == 'miner' && c.memory.target == key);
      if (onlyWorked && !miners.length) continue;
      console.log(_.padLeft(roomNameLink(roomName), 8),
          _.padLeft(mem.depositType, 8),
          _.padLeft(mem.pathCost, 6),
          _.padLeft(mem.expiry - Game.time, 7),
          _.padLeft(mem.lastCooldown, 6),
          _.padLeft(miners.length, 7));
    }
  }
}

module.exports = {
  update,
}