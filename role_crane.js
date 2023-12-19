'use strict';

let Alert = require('util_alert');
let SpawnJob = require('util_spawnJob');


const STATE_DEPLOY = 1;
const STATE_CHOOSE = 2;
const STATE_CHOOSE_STORAGE = 11;
const STATE_CHOOSE_SPAWN = 12;
const STATE_EMPTY_LINK = 3;
const STATE_UNLOAD_TERMINAL = 4;
const STATE_LOAD_TERMINAL = 5;
const STATE_LOAD_STORAGE_LINK = 6;
const STATE_LOAD_TOWERS_AND_POWER_SPAWN = 7;
const STATE_LOAD_POWER_SPAWN = 14;
const STATE_LOAD_EXTENSIONS = 8;
const STATE_LOAD_NUKER = 9;
const STATE_UNLOAD_MINERAL_CONTAINER = 10;
const STATE_DUMP_RESOURCES = 13;
const STATE_DUMP_TO_STORAGE = 98;

function getBody(model) {
  let body = [];
  for (let i = 0; i < (model % 100) * 2; i++) {
    body.push(CARRY);
  }

  if (model < 100) body.push(MOVE);

  return body;
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'crane',
      model: model,
      state: STATE_DEPLOY,
      subState: 0,
      renewMe: true
    }
  };
}

function getNewName() {
    return getUniqueCreepName('Crane');
}

const VALID_SUB_ROLES = ['spawnSW', 'spawnNW', 'spawnNE', 'spawnSE', 'storage'];

function requestSpawn(workRoom, model, priority, subRole) {
  if (!workRoom || !model || !subRole || !priority) {
    console.log('Bad args to Crane.requestSpawn');
    return ERR_INVALID_ARGS;
  }

  if (subRole && !VALID_SUB_ROLES.includes(subRole)) {
    workRoom.logError('Bad subRole: ' + subRole);
    return ERR_INVALID_ARGS;
  }

  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  let spawns;
  opts.memory.subRole = subRole;
  opts.memory.workRoom = workRoom.name;

  if (subRole == 'storage' && workRoom.cranePosition) {
    let spawn = workRoom.cranePosition.findClosestByRange(workRoom.spawns);
    if (spawn) {
      spawns = [spawn.name];

      if (spawn.pos.isNearTo(workRoom.cranePosition)) {
        let direction = spawn.pos.getDirectionTo(workRoom.cranePosition);
        opts.directions = [direction];
      }
    }
    if (workRoom.baseType == 'lw') {
      delete opts.memory.renewMe;
    }
  }

  return SpawnJob.requestSpawnSpawn([workRoom.name], spawns, body, name, opts, priority);
}

function requestClearMineralContainer(creep) {
  if (creep.memory.state != STATE_CHOOSE && !creep.room.mineralContainer) return ERR_INVALID_ARGS;

  creep.memory.state = STATE_UNLOAD_MINERAL_CONTAINER;
  creep.memory.subState = 0;
  return OK;
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];
  if (!creep.memory.workLog ) {
    creep.memory.workLog = {};
  }

  if (!creep.room.storage) {
    creep.logError('Cannot identify a storage.');
  }
  
  creep.servedStructures = _.map(creep.memory.servedStructures, Game.getObjectById);

  function myTravelTo(target) {
    creep.travelTo2(target);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    creep.room.memory._storageCraneWatchdog = Game.time;
    repeat = true;
  }
  
  function getWorkPosition() {
    let x, y;

    switch (creep.memory.subRole) {
      case 'spawnNE':
        x = creep.room.spawnLink.pos.x + 1;
        y = creep.room.spawnLink.pos.y - 1;
        break;
      case 'spawnSE':
        x = creep.room.spawnLink.pos.x + 1;
        y = creep.room.spawnLink.pos.y + 1;
        break;
      case 'spawnSW':
        x = creep.room.spawnLink.pos.x - 1;
        y = creep.room.spawnLink.pos.y + 1;
        break;
      case 'spawnNW':
        x = creep.room.spawnLink.pos.x - 1;
        y = creep.room.spawnLink.pos.y - 1;
        break;
      case 'storage':
      default:
        return creep.room.cranePosition;
    }

    return creep.room.getPositionAt(x, y);
  }
  
  function doDeploy() {
    // Move to the crane spot.
    let workPosition = getWorkPosition();

    if (workPosition && creep.pos.isEqualTo(workPosition)) {
      delete creep.memory._move;  // Won't need this. We never move again.
      setState(STATE_CHOOSE);
    } else {
      myTravelTo(workPosition);
    }
  }

  function shouldEmptyLink() {
    let room = creep.room;
    let storageLink = room.storageLink;

    return storageLink && storageLink.energy && storageLink.isReceivingLink;
  }

  function shouldLoadLink() {
    let room = creep.room;
    let storageLink = room.storageLink;

    return storageLink &&
        storageLink.isSendingLink &&
        storageLink.energy < storageLink.energyCapacity &&
        room.storage &&
        room.storage.store.energy > 1000;
  }

  function shouldDumpResources() {
    let room = creep.room;
    return room.storage.store.keanium_bar > 600000;
  }

  function setServedStructures() {
    let candidates = _.compact(_.union(
        [creep.room.storage, creep.room.terminal, creep.room.powerSpawn, creep.room.nuker],
        creep.room.storageExtensions,
        creep.room.links,
        creep.room.spawns,
        creep.room.towers));
    creep.memory.servedStructures = _.map(creep.pos.findInRange(candidates, 1), 'id');
  }

  function alertOutOfPosition() {
    let key = creep.name + Alert.Key.CRANE_OUT_OF_POSITION;
    let message = `Crane in room ${creep.room.link} is out of position at t=${Game.time}`;
    Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.HOURLY, message);
  }
  
  function doChooseStorageCrane() {
    creep.room.memory._storageCraneWatchdog = Game.time;

    if (!creep.pos.isEqualTo(creep.room.cranePosition)) {
      alertOutOfPosition();
      setState(STATE_DEPLOY);
      return;
    }

    if (!creep.memory.servedStructures || creep.id.hashTime(100)) {
      setServedStructures();
    }

    if (!creep.isEmpty) {
        creep.logError('In STATE_CHOOSE with stuff aboard.');
        setState(STATE_DUMP_TO_STORAGE);
        return;
    }
    
    if (shouldEmptyLink()) {
      creep.logDebug('Choosing to empty the storage link.');
      setState(STATE_EMPTY_LINK);
      return;
    }
      
    let needyStructures = _.filter(
        _.compact(creep.servedStructures),
        s => s.store.getUsedCapacity(RESOURCE_ENERGY) < s.store.getFreeCapacity(RESOURCE_ENERGY));
    
    // Load nearby energy structures.
    let needyEnergyStructures = _.filter(
        needyStructures,
        s => (s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION) &&
            s.active);
    if (needyEnergyStructures.length && creep.room.storage.store.energy >= 800) {
      creep.logDebug(`Choosing to fill energy structures. (1)`);
      setState(STATE_LOAD_EXTENSIONS);
      return;
    }

    // Load nearby towers.
    let needyTowers = _.filter(
        needyStructures,
        s => s.structureType == STRUCTURE_TOWER || s.structureType == STRUCTURE_POWER_SPAWN);

    if (needyTowers.length && creep.room.storage.store.energy >= 5000) {
      creep.logDebug('Choosing to fill towers and power spawn.');
      setState(STATE_LOAD_TOWERS_AND_POWER_SPAWN);
      return;
    }

    // Load the storage link if it's a sender.
    if (shouldLoadLink()) {
      creep.logDebug('Choosing to load the storage link.');
      setState(STATE_LOAD_STORAGE_LINK);
      return;
    }

    // If the terminal has excess stuff, dump it.
    if (creep.room.terminal &&
        creep.room.storage &&
        creep.room.storage.active &&
            _.sum(creep.room.terminal.excess) &&
            _.sum(creep.room.storage.store) <= creep.room.storage.storeCapacity * 95 / 100 &&
            _.includes(creep.servedStructures, creep.room.terminal)) {
      creep.logDebug('Choosing to unload the terminal.');
      setState(STATE_UNLOAD_TERMINAL);
      return;
    }

    // If the terminal needs stuff, load it.
    if (creep.room.terminal &&
        creep.room.terminal.active &&
        _.sum(creep.room.terminal.need) &&
            _.includes(creep.servedStructures, creep.room.terminal)) {
      creep.logDebug('Choosing to load the terminal.');
      setState(STATE_LOAD_TERMINAL);
      return;
    }
    
    // If the nuker needs fuel, load it.
    if (creep.room.nuker &&
        _.includes(creep.servedStructures, creep.room.nuker) && 
        _.includes(creep.servedStructures, creep.room.storage) && 
        creep.room.storage.store.energy > 300000 &&
        ((creep.room.nuker.ghodium < NUKER_GHODIUM_CAPACITY && creep.room.storage.store.ghodium > 0) ||
        (creep.room.nuker.energy < NUKER_ENERGY_CAPACITY && creep.room.storage.store.energy > 100000))) {
      creep.logDebug('Choosing to load the nuker.');
      setState(STATE_LOAD_NUKER);
      return;
    }

    // Empty the mineral container?
    if (creep.room.baseType == 'lw' &&
        creep.room.mineralContainer &&
        creep.room.mineralContainer.store[creep.room.mineralContainer.mainCargo()] >=
            creep.store.getFreeCapacity()) {
      creep.logDebug('Choosing to empty the mineral container.');
      setState(STATE_UNLOAD_MINERAL_CONTAINER);
      return;
    }

    // If the power spawn is within reach, and low on power, load it.
    if (creep.room.powerSpawn &&
        creep.pos.isNearTo(creep.room.powerSpawn.pos) &&
        creep.room.powerSpawn.store[RESOURCE_POWER] <= 10 &&
        ((creep.room.storage &&
            creep.pos.isNearTo(creep.room.storage.pos) &&
            creep.room.storage.store[RESOURCE_POWER] >= 100) ||
        (creep.room.terminal &&
            creep.pos.isNearTo(creep.room.terminal.pos) &&
            creep.room.terminal.store[RESOURCE_POWER] >= 100))) {
      creep.logDebug(`Choosing to load the powerSpawn.`);
      setState(STATE_LOAD_POWER_SPAWN);
      return;
    }

    // Dump stuff on the floor?
    if (shouldDumpResources()) {
      creep.logDebug('Choosing to dump resources.');
      setState(STATE_DUMP_RESOURCES);
      return;
    }

    creep.logDebug('Waiting.');
  }

  function doChooseSpawnCrane() {
    creep.room.memory._storageCraneWatchdog = Game.time;

    let container = Game.getObjectById(creep.memory.container);
    
    if (!creep.memory.servedStructures || creep.id.hashTime(100)) {
      creep.memory.servedStructures = _.map(creep.pos.findInRange(
          _.compact(_.union(creep.room.spawnExtensions,
                          creep.room.spawns)),
          1), 'id');
          
      let nearContainers = creep.pos.findInRange(creep.room.containers, 1);
      if (nearContainers.length) {
        creep.memory.container = nearContainers[0].id;
      } else {
        creep.logError('spawnCrane has no container.');
      }
    }

    // Load nearby energy structures.
    if (creep.store.energy &&
        _.sum(creep.servedStructures,
              function(s) {
                return s.energyCapacity - (s.energy + (s.energyIncoming || 0));
              })) {
      creep.logDebug('Choosing to fill energy structures. (2)');
      setState(STATE_LOAD_EXTENSIONS);
      return;
    }

    // Dump to container if it's low and there's energy in the spawn link.
    if (container &&
        container.store.energy < CONTAINER_CAPACITY &&
        creep.room.spawnLink &&
        creep.room.spawnLink.energy &&
        creep.store.energy) {
      creep.myTransfer(container, RESOURCE_ENERGY);
      return;
    }

    // If there's energy in the spawn link and I have room, grab it.
    if (creep.room.spawnLink && creep.room.spawnLink.energy && creep.store.getFreeCapacity()) {
      creep.withdraw(creep.room.spawnLink, RESOURCE_ENERGY);
      return;
    }
    
    // If there's energy in the container and I have room, grab it.
    if (container && container.store.energy && creep.store.getFreeCapacity()) {
      creep.withdraw(container, RESOURCE_ENERGY);
      return;
    }
    
    creep.logDebug('Waiting.');
  }

  function doChoose() {
    if (creep.memory.subRole == 'storage') {
      setState(STATE_CHOOSE_STORAGE);
    } else if (_.startsWith(creep.memory.subRole, 'spawn')) {
      setState(STATE_CHOOSE_SPAWN);
    } else {
      creep.logError('Bad subRole');
    }
  }

  function doEmptyLink() {
    // Draw one load from the storageLink and deliver it to creep.room.storage.
    if (creep.memory.subState == 0) {
      creep.memory.subState = 1;
    }
    
    if (creep.memory.subState == 1) {
      // Draw what you can from the storageLink, then move to substate 2.
      if (!creep.store.getFreeCapacity() || creep.room.storageLink.energy == 0) {
        creep.logDebug('Loaded. Dumping.');
        creep.memory.subState = 2;
        repeat = true;
        return;
      }
        
      let result = creep.withdraw(creep.room.storageLink, RESOURCE_ENERGY);
      if (result != OK) {
        creep.logDebug('Unexpected fail on withdraw energy from storage: ' + result);
        setState(STATE_CHOOSE);
        return;
      }
    }
      
    if (creep.memory.subState == 2) {
      // Dump whatever you're carrying to storage, then go back to STATE_CHOOSE.
      if (creep.isEmpty) {
        creep.logDebug('Done dumping. Choosing new task.');
        setState(STATE_CHOOSE);
        return;
      }

      let resource = creep.mainCargo();
      let result = creep.myTransfer(creep.room.storage, resource);
      if (result != OK) {
        creep.logDebug('Unexpected fail on transfer ' + resource + ' to storage: ' + result);
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
    }
  }
  
  function doUnloadTerminal() {
    if (!creep.isEmpty) {
      // Dump everything to creep.room.storage.
      creep.logDebug('dumping to storage');
      setState(STATE_DUMP_TO_STORAGE);
      return;
    } else {
      // Pick up whatever resource the terminal has most in excess of max.
      let excess = creep.room.terminal.excess;
      if (_.keys(excess).length == 0) {
        // Weird. How'd we even get into this state?
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
      let resource =
          Object.keys(excess).reduce(function(a, b){ return excess[a] > excess[b] ? a : b });
      let amount = Math.min(creep.store.getCapacity(), excess[resource]);
      creep.logDebug('Taking ' + amount + ' ' + resource + ' from terminal.');
      
      let withdrawResult = creep.withdraw(creep.room.terminal, resource, amount);
      if (withdrawResult == OK) {
        return;
      } else {
        creep.logError('Unexpected result (' + withdrawResult +
            ') on withdrawing ' + amount + ' ' + resource +
            ' from terminal. Resetting.');
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
    }
  }
  
  function doLoadTerminal() {
    if (creep.memory.subState == 0) {
      // Pick up whatever resource the terminal needs the most of.
      let need = creep.room.terminal.need;
      let resource = Object.keys(need).reduce(function(a, b){ return need[a] > need[b] ? a : b });
      let amount = Math.min(creep.store.getCapacity(), need[resource]);
      
      let withdrawResult = creep.withdraw(creep.room.storage, resource, amount);
      if (withdrawResult == OK) {
        creep.logDebug('Loading ' + amount + ' ' + resource + ' from creep.room.storage.');
        creep.memory.subState = 1;
      } else {
        creep.logError('Unexpected result (' + withdrawResult +
            ') on withdrawing ' + amount + ' ' + resource +
            ' from creep.room.storage. Resetting.');
        setState(STATE_DUMP_TO_STORAGE);
      }
      return;
    }
    
    // Dump everything to terminal.
    if (creep.isEmpty) {
      creep.logDebug('Done loading terminal. Choosing new task.');
      setState(STATE_CHOOSE);
      return;
    }

    let resource = creep.mainCargo();
    let result = creep.myTransfer(creep.room.terminal, resource);
    if (result != OK) {
      creep.logDebug('Unexpected fail on transfer ' + resource + ' to terminal: ' + result);
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }
  }
  
  function doLoadStorageLink() {
    if (creep.store.getUsedCapacity() != creep.store.energy) {
      creep.logError(`Somehow I got into LOAD_STORAGE_LINK holding stuff other than energy.`);
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    if (creep.room.storageLink.isReceivingLink) {
      setState(creep.store.getUsedCapacity() ? STATE_DUMP_TO_STORAGE : STATE_CHOOSE);
      return;
    }

    if (creep.store.energy) {
      let storageResult = creep.myTransfer(creep.room.storageLink, RESOURCE_ENERGY);

      if (storageResult == ERR_FULL) {
        creep.logDebug('Link is full. Dumping to storage.');
        setState(STATE_DUMP_TO_STORAGE);
        return;
      } else if (storageResult == ERR_NOT_ENOUGH_RESOURCES) {
        creep.logDebug('ERR_NOT_ENOUGH_RESOURCES? WTF?.');
        setState(STATE_CHOOSE);
        return;
      }
    } else if (creep.room.terminal || creep.room.storage) {
      let amount = Math.min(LINK_CAPACITY, creep.store.getCapacity());
      let terminalExcess = (creep.room.terminal && creep.room.terminal.excess) || 0;
      let energySource = (terminalExcess &&
            terminalExcess.energy >= amount &&
            creep.pos.isNearTo(creep.room.terminal)) ? creep.room.terminal : creep.room.storage;
      let withdrawResult = creep.withdraw(energySource, RESOURCE_ENERGY, amount);
      if (withdrawResult == ERR_NOT_ENOUGH_RESOURCES) {
        setState(STATE_CHOOSE);
        return;
      }
    }
  }
  
  function doLoadTowersAndPowerSpawn() {
    if (creep.memory.subState == 0) {
      if (!creep.store.getFreeCapacity()) {
        creep.logDebug('Full of energy. Filling towers.');
        creep.memory.subState = 1;
      } else {
        creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
        creep.logDebug('Loading energy for towers.');
      }
    }

    if (creep.memory.subState == 1) {
      // Deliver to towers until out of towers or out of energy.
      if (!creep.store.getUsedCapacity()) {
        creep.logDebug('Out of energy. Choosing new task.');
        setState(STATE_CHOOSE);
        return;
      }

      let structures = _(creep.room.towers).union([creep.room.powerSpawn]).compact().value();

      let needyStructure = creep.pos.findInRange(structures, 1, {
        filter: t => t.store.getFreeCapacity(RESOURCE_ENERGY)
      })[0];

      if (!needyStructure)  {
        creep.logDebug('Done filling towers.');
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }

      creep.myTransfer(needyStructure, RESOURCE_ENERGY);
      creep.logDebug('Filling tower.');
    }
  }

  function doLoadPowerSpawn() {
    let powerSpawn = creep.room.powerSpawn;
    if (!powerSpawn || powerSpawn.store.getFreeCapacity(RESOURCE_POWER) == 0) {
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    if (creep.store.power) {
      if (creep.myTransfer(powerSpawn, RESOURCE_POWER) == OK) {
        setState(STATE_DUMP_TO_STORAGE);
        repeat = false;
      }
      return;
    }

    let powerSource;
    if (creep.room.storage &&
        creep.pos.isNearTo(creep.room.storage.pos) &&
        creep.room.storage.store[RESOURCE_POWER]) {
      powerSource = creep.room.storage;
    } else if (creep.room.terminal &&
        creep.pos.isNearTo(creep.room.terminal.pos) &&
        creep.room.terminal.store[RESOURCE_POWER]) {
      powerSource = creep.room.terminal;
    } else {
      creep.logError(`Failed to find power source.`);
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    let amountToLoad = Math.min(creep.store.getFreeCapacity(RESOURCE_POWER),
        powerSpawn.store.getFreeCapacity(RESOURCE_POWER),
        powerSource.store.getUsedCapacity(RESOURCE_POWER));

    let result = creep.withdraw(powerSource, RESOURCE_POWER, amountToLoad);
    if (result != OK) {
      creep.logError(`Failed to withdraw power: ${result}`);
    }
  }

  function doLoadNuker() {
    if (creep.memory.subState == 0) {
      // Load up on ghodium or energy.
      if (creep.room.nuker.ghodium < NUKER_GHODIUM_CAPACITY &&
          creep.room.storage.store.ghodium > 0) {
        creep.logDebug('Loading ghodium for nuker.');
        let amountNeeded = NUKER_GHODIUM_CAPACITY - creep.room.nuker.ghodium;
        let amountAvailable = creep.room.storage.store.ghodium;
        let amountToLoad = Math.min(amountNeeded, amountAvailable, creep.store.getCapacity());
        
        creep.withdraw(creep.room.storage, RESOURCE_GHODIUM, amountToLoad);
        creep.memory.subState = 1;
        return;
      }

      if (creep.room.nuker.energy < NUKER_ENERGY_CAPACITY &&
          creep.room.storage.store.energy > 100000) {
        creep.logDebug('Loading energy for nuker.');
        let amountNeeded = NUKER_ENERGY_CAPACITY - creep.room.nuker.energy;
        let amountAvailable = creep.room.storage.store.energy;
        let amountToLoad = Math.min(amountNeeded, amountAvailable, creep.store.getCapacity());
        
        creep.withdraw(creep.room.storage, RESOURCE_ENERGY, amountToLoad);
        creep.memory.subState = 1;
        return;
      }

      creep.logDebug(`Oops! I went to load the nuker and I can't.`);
    }
    
    if (creep.isEmpty) {
      setState(STATE_CHOOSE);
      return;
    }
    
    if (creep.room.nuker.ghodium < NUKER_GHODIUM_CAPACITY &&
      creep.store.ghodium > 0) {
      creep.myTransfer(creep.room.nuker, RESOURCE_GHODIUM);
      return;
    }

    if (creep.room.nuker.energy < NUKER_ENERGY_CAPACITY &&
      creep.store.energy > 0) {
      creep.myTransfer(creep.room.nuker, RESOURCE_ENERGY);
      return;
    }
    
    setState(STATE_DUMP_TO_STORAGE);
  }

  function doLoadExtensions() {
    let energyStructures = _.filter(
        creep.servedStructures,
        s => s.structureType == STRUCTURE_SPAWN || s.structureType == STRUCTURE_EXTENSION);

    if (creep.memory.subState == 0) {
      // Spawn cranes will begin already loaded.
      if (creep.store.energy) {
        creep.memory.subState = 1;
        repeat = true;
        return;
      }

      // Find the nearby structure with the most energy.
      let structuresWithEnergy = _.filter(
          creep.servedStructures,
          s => s.store && s.store.energy && s.structureType != STRUCTURE_NUKER);
      if (!structuresWithEnergy.length) {
        creep.logError(`Nothing needs energy. Ending without repeat. (bad choice of state)`);
        setState(STATE_CHOOSE);
        repeat = false;
        return;
      }

      let source = _.max(structuresWithEnergy, function(s) {return s.store && s.store.energy});

      // Figure out how much energy the nearby energy structures need.
      let need = _.sum(energyStructures, function(s) { return s.energyCapacity - s.energy;});
      let amt = Math.min(source.store.energy, creep.store.getCapacity(), need);

      let result = creep.withdraw(source, RESOURCE_ENERGY, amt);
      if (result == OK) {
        creep.memory.subState = 1;
        return;
      } else {
        creep.logError('Unexpected doLoadExtensions withdraw result: ' + result);
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
    }
    
    if (creep.memory.subState == 1) {
      if (!creep.store.energy) {
        creep.logDebug(`Out of energy. Done filling.`);
        setState(STATE_CHOOSE);
        return;
      }
      let needyStructures =
          _.filter(energyStructures, s=> s.energy + (s.energyIncoming || 0) < s.energyCapacity);
      if (!needyStructures.length) {
        if (_.startsWith(creep.memory.subRole, 'spawn')) {
          creep.logDebug(`No more needy structures. Done filling.`);
          setState(STATE_CHOOSE);
        } else {
          creep.logDebug(`No more needy structures. Dumping to storage.`);
          setState(STATE_DUMP_TO_STORAGE);
        }
        return;
      }
      
      let neediest = _.max(needyStructures, function (s) {return s.energyCapacity - s.energy;});
      let amt = Math.min(neediest.energyCapacity - neediest.energy, creep.store.energy);
      if (creep.myTransfer(neediest, RESOURCE_ENERGY, amt) == OK) {
        creep.logDebug(`Transferring ${amt} energy to ${neediest.structureType} at ${neediest.pos}.`);
        neediest.energyIncoming = (neediest.energyIncoming || 0) + amt;
      }   
    }
  }

  function doDumpToStorage() {
    if (!creep.pos.isEqualTo(creep.room.cranePosition)) {
      alertOutOfPosition();
      setState(STATE_DEPLOY);
      return;
    }

    // Dump whatever you're carrying to storage, then go back to STATE_CHOOSE.
    if (creep.isEmpty) {
      creep.logDebug('Done dumping. Choosing new task.');
      setState(STATE_CHOOSE);
      return;
    }
    
    if (creep.memory.subRole == 'storage') {
      // Storage crane. Dump to storage.
      if (_.sum(creep.room.storage.store) > creep.room.storage.storeCapacity * 95 / 100) {
        creep.logDebug('storage is too full, so dumping to terminal');
        creep.myTransfer(creep.room.terminal, creep.mainCargo());
      } else {
        creep.logDebug('dumping to storage');
        creep.myTransfer(creep.room.storage, creep.mainCargo());
      }
    } else {
      // Spawn crane. Dump to container if there's energy in the spawnLink,
      // otherwise just sit on what you've got.
      if (creep.room.spawnLink && creep.room.spawnLink.energy) {
        let container = Game.getObjectById(creep.memory.container);
        creep.myTransfer(container, RESOURCE_ENERGY);
      }
      setState(STATE_CHOOSE);
      return;
    }
  }

  function doUnloadMineralContainer() {
    if (!creep.isEmpty) {
      // Dump everything to creep.room.storage.
      creep.logDebug('dumping to storage');
      setState(STATE_DUMP_TO_STORAGE);
      return;
    } else {
      // Pick up anything in the storage container
      let resource = creep.room.mineralContainer.mainCargo();
      let withdrawResult = creep.withdraw(creep.room.mineralContainer, resource);
      if (withdrawResult == OK) {
        return;
      } else {
        creep.logError(`Unexpected result (${withdrawResult}) on withdrawing ${resource} from ` +
            `mineralContainer. Resetting.`);
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
    }
  }

  function doDumpResources() {
    if (creep.memory.subState == 0) {
      creep.withdraw(creep.room.storage, RESOURCE_KEANIUM_BAR);
      creep.memory.subState = 1;
      return;
    } else if (creep.memory.subState == 1) {
      creep.drop(RESOURCE_KEANIUM_BAR);
      setState(STATE_CHOOSE);
      repeat = false;
      return;
    }
  }

  function doDie() {
    creep.doDie();
  }

  function doCustom() {
  }
  
  creep.doDieIfNuke(25);
  
  do {
    repeat = false;
    maxRepeat--;
    
    switch (creep.memory.state) {
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_CHOOSE:
        doChoose();
        break;
      case STATE_CHOOSE_STORAGE:
        doChooseStorageCrane();
        break;
      case STATE_CHOOSE_SPAWN:
        doChooseSpawnCrane();
        break;
      case STATE_EMPTY_LINK:
        doEmptyLink();
        break;
      case STATE_UNLOAD_TERMINAL:
        doUnloadTerminal();
        break;
      case STATE_LOAD_TERMINAL:
        doLoadTerminal();
        break;
      case STATE_LOAD_STORAGE_LINK:
        doLoadStorageLink();
        break;
      case STATE_LOAD_TOWERS_AND_POWER_SPAWN:
        doLoadTowersAndPowerSpawn();
        break;
      case STATE_LOAD_POWER_SPAWN:
        doLoadPowerSpawn();
        break;
      case STATE_LOAD_NUKER:
        doLoadNuker();
        break;
      case STATE_LOAD_EXTENSIONS:
        doLoadExtensions();
        break;
      case STATE_DUMP_TO_STORAGE:
        doDumpToStorage();
        break;
      case STATE_UNLOAD_MINERAL_CONTAINER:
        doUnloadMineralContainer();
        break;
      case STATE_DUMP_RESOURCES:
        doDumpResources();
        break;
      case STATE_DIE:
        doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_CHOOSE);
        break;
    }
    stateLog.push({state: creep.memory.state, subState: creep.memory.subState});
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log('Warning: Creep ' + creep.name + ' maxLooped at ' + creep.pos.link);
    stateLog.forEach(function(element) {
        console.log('state: ' + element.state + ' substate: ' + element.subState);
    });
  }
  
  // Log the end-of-turn state.
  creep.memory.workLog[creep.memory.state] = ++creep.memory.workLog[creep.memory.state] || 1;
}

module.exports = {
  getBody,
  getDefaultCreateOpts,
  getNewName,
  requestClearMineralContainer,
  requestSpawn,
  run
};