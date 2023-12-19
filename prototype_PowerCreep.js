'use strict';

let Alert = require('util_alert');
let EventLog = require('util_event_log');


const STATE_DEAD = 1;
const STATE_IDLE = 2;
const STATE_RENEW = 3;
const STATE_DUMP_OPS = 4;
const STATE_REGEN_SOURCE = 5;
const STATE_OPERATE_SPAWN = 6;
const STATE_OPERATE_TOWER = 7;
const STATE_GET_OPS = 8;
const STATE_OPERATE_EXTENSIONS = 9;
const STATE_OPERATE_STORAGE = 10;
const STATE_OPERATE_FACTORY = 11;
const STATE_OPERATE_TERMINAL = 12;


PowerCreep.prototype.execute = function() {
  if (this.shard == Game.shard.name) {
    runAlive(this);
  } else if (!this.shard) {
    runDead(this);
  } else {
    // Alive elsewhere. Do nothing.
  }
}

PowerCreep.prototype.logDebug = function(text) {
  this.memory.logDebug = text;
  if (this.memory.debug) {
    console.log(this.name + ': ' + text);
  }
}

PowerCreep.prototype.logError = function(text) {
  this.memory.logError = text;
  console.log(this.name + ': ' + text);
}

PowerCreep.prototype.myTransfer = function(target, resourceType, amount)  {
  return this.transfer(target, resourceType, amount);
}

PowerCreep.prototype.powerCost = function(power) {
  if (!this.powers[power]) {
    return;
  }

  let ops = POWER_INFO[power].ops;

  switch (typeof ops) {
    case 'number':
      return ops;
    case 'object':
      return ops[this.powers[power].level];
    default:
      return 0;
  }
}

PowerCreep.prototype.canUsePower = function(power) {
  return this.room.isPowerEnabled &&
      this.powers[power] &&
      !this.powers[power].cooldown &&
      this.store.ops >= this.powerCost(power);
}

Object.defineProperty(PowerCreep.prototype, 'naked', {
  get: function() {
    if (this._naked) {
      return this._naked;
    }

    return this._naked = !this.pos.hasRampart();
  },
  set: function() {},
  enumerable: false,
  configurable: true,
});

function runAlive(creep) {
  let repeat;
  let maxRepeat = 4;
  let stateLog = [];
  let myFlag = Game.flags[creep.name];
  let busy = false;
  let room = creep.room;
  
  function setState(state) {
    creep.logDebug('setState = ' + state);
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function myPowerEnabledBase() {
    return room.my && room.controller.isPowerEnabled;
  }

  function powerSpawnWithinRange(steps) {
    // TODO: Give me a real implementation.
    return creep.pos.roomName == 'E17N28' &&
      Game.rooms.E18N28.powerSpawn &&
      Game.rooms.E18N28.powerSpawn.my &&
      Game.rooms.E18N28.powerSpawn.active &&
      Game.rooms.E18N28.powerSpawn;
  }
  
  // Can the creep figure out some way to renew?
  // Returns renewTarget if one is available.
  function canRenew() {
    if (room.powerSpawn &&
      room.powerSpawn.my &&
      room.powerSpawn.active) {
      return room.powerSpawn;
    }

    if (room.powerBanks.length) {
      return room.powerBanks[0];
    }

    if (creep.ticksToLive < 500) {
      return powerSpawnWithinRange(creep.ticksToLive);
    }
  }
  
  function canDumpToStructure(structure) {
    return structure &&
      structure.my &&
      structure.active &&
      _.sum(structure.store) <= structure.storeCapacity * 0.9;
  }

  // Returns true if we should try to generate ops.
  function shouldGenerateOps() {
    if (!creep.canUsePower(PWR_GENERATE_OPS)) {
      return false;
    }

    if (!room.my) {
      return creep.store[RESOURCE_OPS] < 100;
    }

    return creep.store[RESOURCE_OPS] < 100 ||
      room.roughInventory(RESOURCE_OPS) < 25000 ||
      (room.nearestVault &&
        room.nearestVault.roughInventory(RESOURCE_OPS) < 500000);
  }
  
  // Returns the tower we should try to operate, if one exists.
  function shouldOperateTower() {
    if (!room.my || !creep.canUsePower(PWR_OPERATE_TOWER)) {
      return;
    }

    let needyTowers = _.filter(room.activeTowers, 'needsOperate');

    if (!needyTowers.length) {
      return;
    }
    
    return creep.pos.findClosestByRange(needyTowers);
  }
  
  // Returns the spawn we should operate, if one exists.
  function shouldOperateSpawn() {
    if (!room.my || !creep.canUsePower(PWR_OPERATE_SPAWN)) {
      return;
    }

    let needySpawns = _.filter(room.spawns, 'needsOperate');
    if (!needySpawns.length) {
      return;
    }

    let idleSpawns = _.filter(needySpawns, s => !s.spawning);

    if (idleSpawns.length) {
      return creep.pos.findClosestByRange(idleSpawns);
    }

    return _.min(needySpawns, 'spawning.remainingTime');
  }
  
  // Returns the source we should try to renew, if one exists.
  function shouldRegenSource() {
    if (!room.my || !creep.canUsePower(PWR_REGEN_SOURCE)) {
      return;
    }

    return creep.pos.findClosestByRange(FIND_SOURCES, {filter: s => s.needsRegen});
  }

  function shouldOperateExtensions() {
    if (!room.my ||
        !creep.canUsePower(PWR_OPERATE_EXTENSION) ||
        room.baseType == 'bunker' ||
        !room.memory.experiments ||
        !room.memory.experiments.operateExtensions ||
        !room.storage ||
        !room.storage.active ||
        room.storage.store.energy < 10000) {
      creep.logDebug('shouldOperateExtensions quick out');
      return false;
    }
    
    if (_.any(room.diggerExtensions, c => c.energy < c.energyCapacity) ||
      _.any(room.storageExtensions, c => c.energy < c.energyCapacity)) {
      creep.logDebug(`Not operating extensions because extensions with cranes are empty.`);
      return false;
    }

    if (room.energyAvailable >= room.energyCapacityAvailable) {
      creep.logDebug(`Not operating extensions because they're all full.`);
      return false;
    }

    if (_.any(room.extensions, c => c.energy < c.energyCapacity)) {
      creep.logDebug(`I could operate extensions.`);
      return true;
    }

    // Didn't catch this case above because some spawn isn't full.
    creep.logDebug(`Not operating extensions because they're all full.`);
    return false;
  }

  function shouldOperateStorage() {
    return room.my &&
        creep.canUsePower(PWR_OPERATE_STORAGE) &&
        room.storage &&
        room.storage.active &&
        room.storage.needsOperate;
  }

  function shouldOperateTerminal() {
    return room.my &&
        creep.canUsePower(PWR_OPERATE_TERMINAL) &&
        room.terminal &&
        room.terminal.active &&
        room.terminal.needsOperate;
  }

  function shouldOperateFactory() {
    return room.my &&
        creep.canUsePower(PWR_OPERATE_FACTORY) &&
        room.factory &&
        room.factory.active &&
        room.factory.needsOperate;
  }

  function shouldDisruptSpawn() {
    if (!room.hostile || !creep.canUsePower(PWR_DISRUPT_SPAWN) || room.memory.noDisruptSpawn) {
      return;
    }

    let needySpawns = creep.pos.findInRange(
        room.spawns,
        /* range = */ 20,
        {filter: t => t.active && !t.disruptIncoming && t.disruptTicksRemaining < 2});

    if (!needySpawns.length) {
      return;
    }

    return _.max(needySpawns, s => s.pos.getRangeTo(creep));
  }

  function shouldDisruptTerminal() {
    return creep.canUsePower(PWR_DISRUPT_TERMINAL) &&
        room.activeTerminal &&
        room.activeTerminal.hostile &&
        !room.activeTerminal.disruptIncoming &&
        !room.memory.noDisruptTerminal &&
        room.activeTerminal.disruptTicksRemaining < 2;
  }

  function shouldDisruptTower() {
    if (!room.hostile || !creep.canUsePower(PWR_DISRUPT_TOWER) || room.memory.noDisruptTower) {
      return;
    }

    let needyTowers = _.filter(
        room.activeTowers,
        t => !t.disruptIncoming && t.disruptTicksRemaining < 2);

    if (!needyTowers.length) {
      return;
    }
    
    return creep.pos.findClosestByRange(needyTowers);
  }

  function shouldEnableRoom() {
    if (!room.controller || room.controller.isPowerEnabled) return false;
    if (room.memory && room.memory.enableRoom) return true;
    if (room.name == creep.memory.homeRoom) return true;
    return false;
  }

  // Returns the amount of ops the creep wants to always keep on hand.
  function minCarryOps() {
    return Math.max(200, Math.ceil(creep.store.getCapacity() / 8));
  }
  
  // Returns the max amount of ops the creep wants to carry before dumping.
  function maxCarryOps() {
    return Math.max(250, Math.floor(creep.store.getCapacity() / 2));
  }
  
  function nearestStructureWithOps() {
    return creep.pos.findClosestByPath(
        _.compact([room.terminal, room.storage]),
        {filter: s => s.store.ops});
  }
  
  function doDead() {
    // Okay, we're alive now. Whatever.
    setState(STATE_IDLE);
  }

  let lastOperation = `none`;

  function moveAwayFromCreep(target) {
    let options = creep.pos.getAdjacentWalkableTiles();
    let best = _.find(options, o => !o.hasCreep());
    if (best) {
      creep.travelTo(best, {range:0});
    } else {
      let key = this.room.name + Alert.Key.POWER_CREEP_BLOCKED;
      let message = `Power Creep blocked in room ${this.room.name} at t=${Game.time}`;
      Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);
    }
  }

  function doIdle() {
    try {
      doIdleImpl();
    } catch (err) {
      creep.logError(`doIdle error: ${err}, lastOperation = ${lastOperation}`);
    }
  }
  
  function doIdleImpl() {
    if (!creep.memory.homeShard) {
      creep.logError(`setting homeShard to ${Game.shard.name}`);
      creep.memory.homeShard = Game.shard.name;
    }

    if (!creep.memory.homeRoom) {
      if (creep.room && creep.room.isMyBase && creep.room.controller.isPowerEnabled) {
        creep.logError(`setting homeRoom to ${creep.room.name}`);
        creep.memory.homeRoom = creep.room.name;
      }
    }

    let blocked = creep.pos.blockedCreep();

    if (blocked) {
      creep.logDebug(`unblocking at ${creep.pos.link}`);
      if (blocked.memory.role == 'tug') {
        moveAwayFromCreep(blocked);
      } else {
        creep.travelTo(blocked, {range: 0});
      }
      return;
    }
    lastOperation = `unblock`;
    
    if (myFlag && myFlag.room != room) {
      creep.travelTo(myFlag.pos, {range:0});
      return;
    }
    lastOperation = `flag`;

    if (!myFlag && creep.memory.homeRoom && room.name != creep.memory.homeRoom) {
      creep.travelTo(roomGuardPosition(creep.memory.homeRoom));
      return;
    }
    lastOperation = `guard`;

    if (shouldDisruptTerminal()) {
      if (creep.usePower(PWR_DISRUPT_TERMINAL, room.terminal) == OK) {
        room.terminal.disruptIncoming = true;
        return;
      }
    }
    lastOperation = `disrupt term`;

    let spawn = shouldDisruptSpawn();
    if (spawn) {
      if (creep.usePower(PWR_DISRUPT_SPAWN, spawn) == OK) {
        spawn.disruptIncoming = true;
        return;
      }
    }
    lastOperation = `disrupt spawn`;

    let tower = shouldDisruptTower();
    if (tower) {
      if (creep.usePower(PWR_DISRUPT_TOWER, tower) == OK) {
        tower.disruptIncoming = true;
        return;
      }
    }
    lastOperation = `disrupt tower`;

    if (creep.ticksToLive < 4000 && canRenew()) {
      setState(STATE_RENEW);
      return;
    }
    lastOperation = `renew`;
    
    if (creep.store.ops > maxCarryOps() && canDumpToStructure(room.terminal)) {
      setState(STATE_DUMP_OPS);
      return;
    }
    lastOperation = `dump`;
    
    if (shouldOperateTower()) {
      setState(STATE_OPERATE_TOWER);
      return;
    }
    lastOperation = `op tower`;
    
    if (shouldOperateSpawn()) {
      setState(STATE_OPERATE_SPAWN);
      return;
    }
    lastOperation = `op spawn`;
    
    if (shouldRegenSource()) {
      setState(STATE_REGEN_SOURCE);
      return;
    }
    lastOperation = `regen source`;
    
    if (shouldOperateExtensions()) {
      setState(STATE_OPERATE_EXTENSIONS);
      return;
    }
    lastOperation = `op ext`;
    
    if (shouldOperateStorage()) {
      setState(STATE_OPERATE_STORAGE);
      return;
    }
    lastOperation = `op storage`;
    
    if (shouldOperateTerminal()) {
      setState(STATE_OPERATE_TERMINAL);
      return;
    }
    lastOperation = `op terminal`;
    
    if (shouldOperateFactory()) {
      setState(STATE_OPERATE_FACTORY);
      return;
    }
    lastOperation = `op factory`;
    
    if (creep.store.ops < minCarryOps() && nearestStructureWithOps()) {
      setState(STATE_GET_OPS);
      return;
    }
    lastOperation = `get ops`;
    
    if (!busy && shouldEnableRoom()) {
      let result = creep.enableRoom(room.controller);

      if (result == OK) {
        delete room.memory.enableRoom;
      } else if (result == ERR_NOT_IN_RANGE) {
        creep.travelTo(room.controller, {range: 1});
        return;
      }
    }
    lastOperation = `goto controller`;

    if (myFlag) {
      creep.travelTo(myFlag.pos, {range:0});
      return;
    }

    if (!myFlag && creep.memory.homeRoom && creep.naked) {
      let target = room.storage || room.terminal || room.spawns[0];

      if (target) {
        creep.travelTo(target, {range:1});
        return;
      }
    }
  }
  
  function doRenew() {
    let renewTarget = canRenew();

    if (creep.ticksToLive > 4995 || !renewTarget) {
      setState(STATE_IDLE);
      return;
    }

    if (creep.renew(renewTarget) == ERR_NOT_IN_RANGE)  {
      creep.travelTo(renewTarget);
    }
  }
  
  function doDumpOps() {
    let dumpTarget = room.terminal;
    let haveAmount = creep.store.ops || 0;
    let dumpAmount = haveAmount - minCarryOps();
    if (dumpAmount <= 0 || !canDumpToStructure(dumpTarget)) {
      setState(STATE_IDLE);
      return;
    }
    
    if (creep.myTransfer(dumpTarget, RESOURCE_OPS, dumpAmount) == ERR_NOT_IN_RANGE) {
      creep.travelTo(dumpTarget, {range: 1});
    }
  }
  
  function doRegenSource() {
    creep.logDebug('regen source');
    let source = shouldRegenSource();
    
    if (source) {
      let result = creep.usePower(PWR_REGEN_SOURCE, source);
      if (result == OK) {
        source.registerRegen();
        busy = true;
      } else if (result == ERR_NOT_IN_RANGE) {
        creep.travelTo(source, {range: 3})
      }
    } else {
      setState(STATE_IDLE);
      return;
    }
  }
  
  function doOperateSpawn() {
    creep.logDebug('operate spawn');
    let spawn = shouldOperateSpawn();
    
    if (spawn) {
      let result = creep.usePower(PWR_OPERATE_SPAWN, spawn);
      if (result == OK) {
        busy = true;
      } else if (result == ERR_NOT_IN_RANGE) {
        creep.travelTo(spawn, {range: 3})
      }
    } else {
      setState(STATE_IDLE);
      return;
    }
  }
  
  function doOperateTower() {
    creep.logDebug('operate tower');
    let tower = shouldOperateTower();
    
    if (tower) {
      let result = creep.usePower(PWR_OPERATE_TOWER, tower);
      if (result == OK) {
        busy = true;
      } else if (result == ERR_NOT_IN_RANGE) {
        creep.travelTo(tower, {range: 3})
      }
    } else {
      setState(STATE_IDLE);
      return;
    }
  }
  
  function doOperateExtensions() {
    creep.logDebug('operate extensions');
    if (!shouldOperateExtensions()) {
      setState(STATE_IDLE);
      return;
    }

    if (room.storage && room.storage.store.energy) {
      let result = creep.usePower(PWR_OPERATE_EXTENSION, room.storage);
      if (result == OK) {
        busy = true;
      } else if (result == ERR_NOT_IN_RANGE) {
        creep.travelTo(room.storage, {range: 3})
      }
    } else {
      setState(STATE_IDLE);
      return;
    }
  }

  function doOperateStorage() {
    creep.logDebug('operate storage');
    if (!shouldOperateStorage()) {
      setState(STATE_IDLE);
      return;
    }

    let result = creep.usePower(PWR_OPERATE_STORAGE, room.storage);
    if (result == OK) {
      busy = true;
    } else if (result == ERR_NOT_IN_RANGE) {
      creep.travelTo(room.storage, {range: 3})
    }
  }
  
  function doOperateTerminal() {
    creep.logDebug('operate terminal');
    if (!shouldOperateTerminal()) {
      setState(STATE_IDLE);
      return;
    }

    let result = creep.usePower(PWR_OPERATE_TERMINAL, room.terminal);
    if (result == OK) {
      busy = true;
    } else if (result == ERR_NOT_IN_RANGE) {
      creep.travelTo(room.terminal, {range: 3})
    }
  }
  
  function doOperateFactory() {
    creep.logDebug('operate factory');
    if (!shouldOperateFactory()) {
      setState(STATE_IDLE);
      return;
    }

    let result = creep.usePower(PWR_OPERATE_FACTORY, room.factory);
    if (result == OK) {
      busy = true;
      delete room.memory.initFactory;
    } else if (result == ERR_NOT_IN_RANGE) {
      creep.travelTo(room.factory, {range: 3})
    }
  }
  
  function doGetOps() {
    let opsSource = nearestStructureWithOps();
    let haveAmount = creep.store.ops || 0;
    let getAmount = minCarryOps() - haveAmount;
    if (getAmount <= 0 || !opsSource) {
      setState(STATE_IDLE);
      return;
    }
    
    getAmount = Math.min(getAmount, opsSource.store.ops);
    
    if (creep.withdraw(opsSource, RESOURCE_OPS, getAmount) == ERR_NOT_IN_RANGE) {
      creep.travelTo(opsSource);
    }
  }
  
  function doDie() {
    if (!creep.store.ops || !room.mainStore) {
      creep.suicide();
    }
    
    if (creep.myTransfer(room.mainStore, RESOURCE_OPS) == ERR_NOT_IN_RANGE) {
      creep.travelTo(room.mainStore, {range: 1});
    }
  }
  
  function doCustom() {
  }
  
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_DEAD:
        doDead();
        break;
      case STATE_IDLE:
        doIdle();
        break;
      case STATE_RENEW:
        doRenew();
        break;
      case STATE_DUMP_OPS:
        doDumpOps();
        break;
      case STATE_REGEN_SOURCE:
        doRegenSource();
        break;
      case STATE_OPERATE_SPAWN:
        doOperateSpawn();
        break;
      case STATE_OPERATE_TOWER:
        doOperateTower();
        break;
      case STATE_GET_OPS:
        doGetOps();
        break;
      case STATE_OPERATE_EXTENSIONS:
        doOperateExtensions();
        break;
      case STATE_OPERATE_STORAGE:
        doOperateStorage();
        break;
      case STATE_OPERATE_FACTORY:
        doOperateFactory();
        break;
      case STATE_OPERATE_TERMINAL:
        doOperateTerminal();
        break;
      case STATE_DIE:
        doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_IDLE);
        break;
    }
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log('Warning: Creep ' + creep.name + ' maxLooped at ' + creep.pos.link);
    stateLog.forEach(function(element) {
      console.log('state: ' + element.state + ' substate: ' + element.subState);
    });
  }
  
  if (!busy && shouldGenerateOps()) {
    creep.usePower(PWR_GENERATE_OPS);
  }
}

function runDead(creep) {
  let repeat;
  let maxRepeat = 4;
  let stateLog = [];
  
  function setState(state) {
    creep.logDebug('setState =' + state);
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  
  function doDead() {
    // Stay dead.
    let key = creep.name + Alert.Key.POWER_CREEP_DEAD;
    let message = `Power Creep ${creep.name} dead with homeroom ${creep.memory.homeRoom} at t=${Game.time}`;
    Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);

    if (creep.spawnCooldownTime > Date.now()) return;

    if (creep.memory.homeShard != Game.shard.name) return;

    let homeBase = Game.rooms[creep.memory.homeRoom];

    if (!homeBase || !homeBase.isMyBase || !homeBase.powerSpawn || !homeBase.powerSpawn.active) return;

    if (homeBase.powerSpawn.naked) return;

    if (creep.spawn(homeBase.powerSpawn) == OK) {
      let key = creep.name + Alert.Key.POWER_CREEP_SPAWNED;
      let message = `Power Creep ${creep.name} spawned in ${homeBase.name} at t=${Game.time}`;
      Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);
    }
  }

  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_DEAD:
        doDead();
        break;
      default:
        setState(STATE_DEAD);
        break;
    }
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log('Warning: Creep ' + creep.name + ' maxLooped at ' + creep.pos.link);
    stateLog.forEach(function(element) {
      console.log('state: ' + element.state + ' substate: ' + element.subState);
    });
  }
}