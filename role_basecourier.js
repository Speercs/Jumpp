'use strict';

let EventLog = require('util_event_log');
let SpawnJob = require('util_spawnJob');

const STATE_CHOOSE = 1;
const STATE_EMPTY_LINK = 2;
const STATE_LOAD_NUKER = 3;
const STATE_LOAD_POWER_SPAWN = 4;
const STATE_UNLOAD_TERMINAL = 5;
const STATE_LOAD_TERMINAL = 7;
const STATE_LOAD_BOOST_LAB = 6;
const STATE_SERVICE_LABS = 8;
const STATE_LOAD_TOWERS = 9;
const STATE_LOAD_LAB_ENERGY = 10;
const STATE_LOAD_UPGRADE_CONTAINER = 11;
const STATE_RECOVER_TOMBSTONE = 12;
const STATE_RECOVER_PILE = 13;
const STATE_UNLOAD_TOWERS_AND_LABS = 14;
const STATE_LOAD_STORAGE_LINK = 15;
const STATE_UNUSED2 = 16;
const STATE_CLEANUP_CONTROLLER = 17;
const STATE_LOOT_RUIN = 18;
const STATE_SERVICE_FACTORY = 19;
const STATE_RENEW = 97;
const STATE_DUMP_TO_STORAGE = 98;

const MAX_TOMBSTONE_DISTANCE = 8;

function getBody(model) {
  let body = []
  for (let i = 0; i < model * 2; i++) {
    body.push(CARRY);
  }
  for (let i = 0; i < model; i++) {
    body.push(MOVE);
  }
  return body;
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'basecourier',
      model: model,
      state: STATE_CHOOSE,
      subState: 0,
      renewMe: true
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Basecourier');
}

function requestSpawn(rooms, model, flag, priority) {
  if (!rooms || !Array.isArray(rooms) || !model || !priority) {
    flag.logError('Bad args to Basecourier.requestSpawn');
    return ERR_INVALID_ARGS;
  }

  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);

  if (flag) {
    opts.memory.flagName = flag.name;
    opts.memory.workRoom = flag.pos.roomName;
  } else {
    opts.memory.workRoom = rooms[0];
  }

  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function getLabMineralExcess(room) {
  let excess = [];

  let foreignLabs = _.filter(room.labs, l => !l.my);

  for (let i = 0; i < foreignLabs.length; i++) {
    let lab = foreignLabs[i];

    if (lab.mineralAmount > 0) {
      excess.push({
          labId: lab.id,
          resourceType: lab.mineralType,
          resourceAmount: lab.mineralAmount,
          urgent: true
      });
    }
  }

  let labMemory = room.memory.labs;

  if (!labMemory) {
    return excess;
  }

  for (let i = 0; i < room.inactiveLabs.length; i++) {
    let lab = room.inactiveLabs[i];

    if (lab.excessMinerals > 0) {
      excess.push({
          labId: lab.id,
          resourceType: lab.mineralType,
          resourceAmount: Math.max(0,lab.excessMinerals),
          urgent: lab.urgent
      });
    }
  }

  for (let i = 0; i < room.sourceLabs.length; i++) {
    let lab = room.sourceLabs[i];

    if (lab.excessMinerals >= 100 || (lab.excessMinerals && lab.urgent)) {
      excess.push({
          labId: lab.id,
          resourceType: lab.mineralType,
          resourceAmount: Math.max(0,lab.excessMinerals),
          urgent: lab.urgent
      });
    }
  }

  for (let i = 0; i < room.destLabs.length; i++) {
    let lab = room.destLabs[i];

    if (lab.excessMinerals >= 100 || (lab.excessMinerals && lab.urgent)) {
      excess.push({
          labId: lab.id,
          resourceType: lab.mineralType,
          resourceAmount: Math.max(0,lab.excessMinerals),
          urgent: lab.urgent
      });
    }
  }

  return excess;
}

function getLabMineralNeed(room) {
  let labMemory = room.memory.labs;
  let need = [];

  if (!labMemory) {
    return need;
  }

  let storage = room.activeTerminal || room.mainStore;

  if (!storage) {
    return need;
  }

  for (let i = 0; i < room.sourceLabs.length; i++) {
    let lab = room.sourceLabs[i];

    // Consider only needs that could be met by what's in storage.
    if (lab.neededMinerals && storage.store[lab.neededMineralType]) {
      need.push({
          labId: lab.id,
          resourceType: lab.neededMineralType,
          resourceAmount: Math.max(0,lab.neededMinerals),
          urgent: lab.urgent
      });
    }
  }

  for (let i = 0; i < room.destLabs.length; i++) {
    let lab = room.destLabs[i];

    // Consider only needs that could be met by what's in storage.
    if (lab.neededMinerals && storage.store[lab.neededMineralType]) {
      need.push({
          need: lab.id,
          resourceType: lab.neededMineralType,
          resourceAmount: Math.max(0,lab.neededMinerals),
          urgent: lab.urgent
      });
    }
  }

  return need;
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 7;
  let stateLog = [];
  let storeCapacity = creep.store.getCapacity();
  if (!creep.memory.workLog) {
    creep.memory.workLog = {};
  }

  if (creep.pos.roomName != creep.memory.workRoom) {
    creep.logError(`I'm not in my work room. ${creep.pos.link}`);
    EventLog.writeEntry(EventLog.ERROR, creep.room.name, 'Basecourier left work room.');
  }

  creep.storage = creep.room.mainStore;

  if (!creep.storage) {
    creep.doDie();
    return;
  }

  // Special base-recovery gunk.
  if (!creep.storage.store.energy && !creep.storage.active) {
    if (creep.room.activeTerminal && creep.room.activeTerminal.store.energy) {
      creep.storage = creep.room.terminal;
    }
  }

  function myTravelTo(target, opts) {
    let options = {
        maxRooms: 1,
        range: 1,
        restrictDistance: 1,
        roomCallback: staySafeCallback
    };

    _.merge(options, opts);

    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function findNearestRenewSpawn() {
    let eligibleSpawns = _.filter(
        creep.room.spawns,
        s => !s.spawning && 
            (s.room.baseType == 'bunker' ||
                s.room.baseType == 'tigga' ||
                !s.isDiggerSpawn));

    return creep.pos.findClosestByPath(eligibleSpawns);
  }

  function shouldCleanupController() {
    if (!creep.room.memory.serveController || creep.room.controller.level < 8) {
      return;
    }

    if (!creep.room.terminal || !creep.room.terminal.servingController) {
      return false;
    }

    if (!creep.room.labs.length) {
      return false;
    }

    let servingLab = _.find(creep.room.labs, 'servingController');

    if (!servingLab || (!servingLab.energy && !servingLab.mineralAmount)) {
      return false;
    }

    return servingLab;
  }

  function doChoose() {
    creep.logDebug('choosing new job');

    if (creep.room.basecouriers.length > 1) {
      let betterModels = _.filter(
          creep.room.basecouriers,
          c => c.id != creep.id &&
              c.ticksToLive &&
              c.memory.state != STATE_DIE &&
              (c.memory.model > creep.memory.model || c.ticksToLive > creep.ticksToLive));
      if (betterModels.length) {
        creep.logError(`Retiring because a better model is present. ${creep.pos.link}`);
        setState(STATE_DIE);
        return;
      }
    }

    if (!creep.isEmpty) {
      creep.logError('In STATE_CHOOSE with stuff aboard at ' + creep.pos.link);
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    if (shouldLoadBoostLab()) {
      setState(STATE_LOAD_BOOST_LAB);
      return;
    }

    // If we're critically low on TTL, go get more.
    if (creep.ticksToLive < 300 &&
        !creep.memory.noRenew &&
        creep.model == creep.room.basecourierModel) {
      let nearestSpawn = findNearestRenewSpawn();
      if (nearestSpawn) {
        setState(STATE_RENEW);
        return;
      }
    }

    // If the upgrade container is well-stocked, keep the storage link
    // empty.
    if (creep.room.upgradeContainer &&
        !creep.room.storageCrane &&
        creep.room.storageLink &&
        creep.room.storageLink.energy &&
        creep.room.upgradeContainer.store.energy >= 1600) {
      creep.logDebug('Choosing to empty a link.');
      setState(STATE_EMPTY_LINK);
      return;
    }

    // If towers are low, fill them.
    // Look only at active towers. Ignore creep towers. If room is a bunker,
    // ignore towers that are exactly two tiles away from storage.  Those
    // will be served by loaders.
    let needyTowers = _.filter(
      _.difference(creep.room.activeTowers, creep.room.craneTowers),
      s => (!s.room.activeStorage ||
              s.room.baseType != 'bunker' ||
              s.pos.getRangeTo(s.room.storage) != 2) &&
          s.energy < s.energyCapacity/2);

    if (creep.storage.store.energy >= storeCapacity &&
      !creep.room.memory.shutdown &&
      needyTowers.length) {
      creep.logDebug('Choosing to fill the towers. (2)');
      setState(STATE_LOAD_TOWERS);
      return;
    }

    // Must go before STATE_UNLOAD_TERMINAL.
    if (shouldCleanupController()) {
      setState(STATE_CLEANUP_CONTROLLER);
      return;
    }

    // If the terminal is in servingController mode and has excess stuff, dump it.
    // Must go after STATE_CLEANUP_CONTROLLER.
    if (creep.room.activeTerminal &&
        creep.room.activeTerminal.servingController &&
        creep.room.storage &&
        _.sum(creep.room.activeTerminal.getExcess())) {
      creep.logDebug('Choosing to unload the terminal.');
      let excess = creep.room.activeTerminal.getExcess();
      creep.logDebug('TerminalExcess = ' + JSON.stringify(excess));
      setState(STATE_UNLOAD_TERMINAL);
      return;
    }

    creep.logDebug('considering lab stuff');
    if (!creep.memory._nextLabCheck || creep.memory._nextLabCheck < Game.time) {
      let labNeed = getLabMineralNeed(creep.room);
      let labExcess = getLabMineralExcess(creep.room);
      let urgentNeed = _.filter(labNeed, n => n.urgent);
      let urgentExcess = _.filter(labExcess, n => n.urgent);
      let totalLabNeed = _.sum(labNeed, 'resourceAmount');
      let totalLabExcess = _.sum(labExcess, 'resourceAmount');
      let totalUrgentNeed = _.sum(urgentNeed, 'resourceAmount');
      let totalUrgentExcess = _.sum(urgentExcess, 'resourceAmount');

      if (creep.room.activeTerminal &&
        ((totalLabNeed >= storeCapacity) ||
        (totalLabExcess >= storeCapacity) ||
        totalUrgentNeed > 0 ||
        totalUrgentExcess > 0)) {
        if (totalLabNeed >= storeCapacity) {
          creep.logDebug('Choosing to service the labs because totalLabNeed = ' + totalLabNeed);
        }
        if (totalLabExcess >= storeCapacity) {
          creep.logDebug('Choosing to service the labs because totalLabExcess = ' + totalLabExcess);
        }
        if (totalUrgentNeed) {
          creep.logDebug('Choosing to service the labs because totalUrgentNeed = ' + totalUrgentNeed);
        }
        if (totalUrgentExcess) {
          creep.logDebug('Choosing to service the labs because totalUrgentExcess = ' + totalUrgentExcess);
        }
        setState(STATE_SERVICE_LABS);
        return;
      } else {
        creep.memory._nextLabCheck = Game.time + 20;
      }
    }

    creep.logDebug('considering more lab stuff');
    // Maybe service the labs.
    if (!creep.room.memory.shutdown && creep.room.labs.length) {
      let labsNeedEnergy = _.filter(
          creep.room.labs,
          s => s.store.getFreeCapacity(RESOURCE_ENERGY) && s.my && s.active && !s.servingController);
      if (labsNeedEnergy.length) {
        setState(STATE_LOAD_LAB_ENERGY);
        return;
      }
    }

    // If there are stones near the storage, recover them.
    if (Game.time > (creep.memory._nextStoneCheck || 0)) {
      let stonesNearStorage = creep.storage.pos.findInRange(
          FIND_TOMBSTONES,
          MAX_TOMBSTONE_DISTANCE,
          {filter: t => t.pos.isSafe() &&
              (t.store.energy > 200 || t.store.getUsedCapacity() > t.store.energy)}
      );

      if (stonesNearStorage.length) {
        // Check that a path to it exists. Sometimes one doesn't.
        let nearestStone = creep.pos.findClosestByPath(stonesNearStorage);
        if (nearestStone) {
          setState(STATE_RECOVER_TOMBSTONE);
          return;
        }
      } else {
        creep.memory._nextStoneCheck = Game.time + 20;
      }
    }

    // If there's a pile within 12 of the storage, and not under the crane, grab it.
    let piles = creep.storage.pos.findInRange(FIND_DROPPED_RESOURCES, 12);
    if (piles.length) {
      let storageCranePosition = creep.room.storageCrane && creep.room.storageCrane.pos;
      let safePiles = _.filter(piles, p => p.pos.isSafe() && (!creep.room.storageCrane || !p.pos.isEqualTo(storageCranePosition)));
      if (safePiles.length) {
        creep.logDebug('Choosing to recover a pile at ' + safePiles[0].pos);
        setState(STATE_RECOVER_PILE);
        return;
      }
    }

    // Ruin?
    let ruins =
        creep.storage.pos.findInRange(FIND_RUINS, 9, {filter: r => r.store.getUsedCapacity()});
    let safeRuins = _.filter(ruins, r => r.pos.isSafe());
    if (safeRuins.length) {
      creep.logDebug('Choosing to loot a ruin at ' + safeRuins[0].pos);
      setState(STATE_LOOT_RUIN);
      return;
    }

    // If the upgrade container is low, AND
    //  there's no upgradeLink, AND
    //  the terminal isn't serving the controller, fill it.
    if (!creep.room.upgradeLink &&
        creep.room.alertCondition != ALERT_CONDITION_RED &&
        creep.room.upgradeContainer &&
        creep.room.upgradeContainer != creep.storage &&     // altStorage might be upgradeContainer
        creep.room.upgradeContainer.store.energy < 1500 &&
        (!creep.room.activeTerminal || !creep.room.activeTerminal.servingController) &&
      creep.storage.store.energy >= storeCapacity) {
      creep.logDebug('Choosing to fill the upgradeContainer.');
      setState(STATE_LOAD_UPGRADE_CONTAINER);
      return;
    }

    // If the upgrade container starving, and an upgrader is on station, fill it whether or not there's
    // an upgradeLink. (Unless the upgradeLink is a sender)
    if (creep.room.upgradeContainer &&
        creep.room.upgraderWorksOnStation >= 10 &&
        creep.room.alertCondition != ALERT_CONDITION_RED &&
        creep.room.upgradeContainer != creep.storage &&     // altStorage might be upgradeContainer
        creep.room.upgradeContainer.store.energy < 50 &&
        (!creep.room.activeTerminal || !creep.room.activeTerminal.servingController) &&
        (!creep.room.upgradeLink || creep.room.upgradeLink.isReceivingLink) &&
        creep.storage.store.energy >= storeCapacity) {
      creep.logDebug('Choosing to fill the upgradeContainer.');
      setState(STATE_LOAD_UPGRADE_CONTAINER);
      return;
    }

    // If there's a powerSpawn that needs stuff, load it.
    let powerSpawn = creep.room.powerSpawn;
    //if (powerSpawn && !creep.room.memory.shutdown) {
    if (powerSpawn &&
        powerSpawn.active &&
        creep.room.activeTerminal &&
        (!creep.room.storageCrane || !creep.room.storageCrane.pos.isNearTo(powerSpawn.pos))) {
      let energyNeeded = powerSpawn.energyCapacity - powerSpawn.energy;
      let powerNeeded = powerSpawn.powerCapacity - powerSpawn.power;

      if (creep.room.activeTerminal.store[RESOURCE_ENERGY] >= energyNeeded &&
          creep.room.activeTerminal.store[RESOURCE_POWER] >= powerNeeded &&
          energyNeeded + powerNeeded >= creep.store.getCapacity()) {
        creep.logDebug('Choosing to load the powerSpawn.');
        setState(STATE_LOAD_POWER_SPAWN);
        return;
      }
    }

    if (creep.room.factory &&
        (_.sum(creep.room.factory.urgentExcess) || _.sum(creep.room.factory.urgentNeeds))) {
      setState(STATE_SERVICE_FACTORY);
      return;
    }

    // If there's a nuker that needs stuff, load it.
    let nuker = creep.room.nuker;
    if (nuker && nuker.active && nuker.cooldown < 50000 && creep.room.activeTerminal) {
      let energyNeeded = nuker.energyCapacity - nuker.energy;
      let ghodiumNeeded = nuker.ghodiumCapacity - nuker.ghodium;

      if ((energyNeeded && creep.room.roughEnergy > 300000) ||
        (ghodiumNeeded && creep.room.activeTerminal.store[RESOURCE_GHODIUM])) {
        creep.logDebug('Choosing to fuel the nuker.');
        setState(STATE_LOAD_NUKER);
        return;
      }
    }

    // If any towers are missing a significant amt of energy, fill them.
    needyTowers = _.filter(
        _.difference(creep.room.activeTowers, creep.room.craneTowers),
        s => (!s.room.storage ||
            s.room.baseType != 'bunker' ||
            s.pos.getRangeTo(s.room.storage) != 2) &&
            s.store.getFreeCapacity(RESOURCE_ENERGY) > 100);
    if (creep.storage.store.energy >= storeCapacity &&
      needyTowers.length &&
      !creep.room.memory.shutdown) {
      creep.logDebug('Choosing to fill the towers. (1)');
      setState(STATE_LOAD_TOWERS);
      return;
    }

    // If I'm blocking someone, move to accommodate them.
    let blocked = creep.pos.blockedCreep();

    if (blocked) {
      myTravelTo(blocked, {range: 0});
      return;
    }

    // If we're at all low on TTL, go get more.
    if (creep.ticksToLive < 800 &&
       !creep.memory.noRenew &&
        (creep.memory.model == creep.room.basecourierModel)) {
      let nearestSpawn = findNearestRenewSpawn();
      if (nearestSpawn) {
        setState(STATE_RENEW);
        return;
      }
    }

    if (creep.room.memory.shutdown &&
        (_.any(creep.room.labs, 'energy') || _.any(creep.room.towers, 'energy'))) {
      creep.logDebug('Choosing to unload towers.');
      setState(STATE_UNLOAD_TOWERS_AND_LABS);
      return;
    }

    // If the terminal is in servingController mode needs stuff, load it.
    if (creep.room.activeTerminal &&
        creep.room.activeTerminal.servingController &&
        creep.room.storage &&
        _.sum(creep.room.activeTerminal.getNeed())) {
      creep.logDebug('Choosing to load the terminal.');
      let needs = creep.room.activeTerminal.getNeed();
      creep.logDebug('TerminalNeeds = ' + JSON.stringify(needs));
      setState(STATE_LOAD_TERMINAL);
      return;
    }

    if (creep.room.factory &&
        (_.sum(creep.room.factory.excess) + _.sum(creep.room.factory.needs) > 1500)) {
      setState(STATE_SERVICE_FACTORY);
      return;
    }

    if (creep.room.terminal &&
        !creep.room.terminal.my &&
        creep.room.storage &&
        creep.room.storage.my &&
        _.sum(creep.room.terminal.getExcess())) {
      creep.logDebug('Choosing to unload the (foreign) terminal.');
      setState(STATE_UNLOAD_TERMINAL);
      return;
    }

    if (!creep.room.storageCrane &&
        creep.room.storageLink &&
        creep.room.upgradeLink &&
        creep.room.mainStore &&
        creep.room.storageLink.store.energy < 401 &&
        creep.room.upgradeLink.store.energy == 0 &&
        creep.room.mainStore.store.energy >= 1200) {
      setState(STATE_LOAD_STORAGE_LINK);
      return;
    }

    creep.logDebug('Waiting.');
    if (creep.room.courierIdlePos) {
      myTravelTo(creep.room.courierIdlePos, {range: 0});
    }
  }

  function doEmptyLink() {
    // Draw one load from the storageLink and deliver it to creep.storage.
    if (creep.memory.subState == 0) {
      creep.memory.subState = 1;
    }

    if (creep.memory.subState == 1) {
      // Draw what you can from the storageLink, then move to substate 2.
      if (creep.store.getFreeCapacity() == 0 || creep.room.storageLink.energy == 0) {
        creep.logDebug('Loaded. Dumping.');
        creep.memory.subState = 2;
        repeat = true;
        return;
      }

      if (creep.withdraw(creep.room.storageLink, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        creep.logDebug('Moving to storageLink.');
        myTravelTo(creep.room.storageLink);
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

      if (creep.myTransfer(creep.storage, creep.mainCargo()) == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.storage);
      }
    }
  }

  function doLoadNuker() {
    // Bail if there isn't an active nuker and an active terminal.
    if (!creep.room.activeTerminal || !creep.room.nuker || !creep.room.nuker.active) {
      creep.logError('Lacking terminal or nuker.');
      setState(STATE_CHOOSE);
      repeat = false;
      return;
    }

    // Gather one load of fuel and deliver to the nuker.
    let nuker = creep.room.nuker;

    if (creep.memory.subState == 0) {
      // Move to terminal.
      if (creep.pos.isNearTo(creep.room.activeTerminal)) {
        creep.logDebug('Reached terminal. Loading.');
        creep.memory.subState = 1;
      } else {
        creep.logDebug('Moving to terminal.');
        myTravelTo(creep.room.activeTerminal);
        return;
      }
    }

    if (creep.memory.subState == 1) {
      // Gather stuff that the nuker needs.
      let energyNeeded = nuker.energyCapacity - (nuker.energy + creep.store.energy);
      let ghodiumNeeded = nuker.ghodiumCapacity - (nuker.ghodium + (creep.store[RESOURCE_GHODIUM] || 0));
      let myCapacity = creep.store.getFreeCapacity();

      if (myCapacity && energyNeeded > 0 && creep.room.activeTerminal.store.energy) {
        let amount = Math.min(myCapacity, creep.room.activeTerminal.store.energy, energyNeeded);
        creep.logDebug('Loading ' + amount + ' energy.');
        creep.withdraw(creep.room.activeTerminal, RESOURCE_ENERGY, amount);
        return;
      } else if (myCapacity && ghodiumNeeded > 0 && creep.room.activeTerminal.store[RESOURCE_GHODIUM]) {
        creep.logDebug('Loading ghodium.');
        creep.withdraw(creep.room.activeTerminal,
            RESOURCE_GHODIUM,
            Math.min(myCapacity,
                creep.room.activeTerminal.store[RESOURCE_GHODIUM],
                ghodiumNeeded)
        );
        return;
      } else {
        creep.logDebug('Done loading. Delivering.');
        creep.memory.subState = 2;
      }
    }

    if (creep.memory.subState == 2) {
      // Deliver.
      if (creep.isEmpty) {
        creep.logDebug('Done delivering. Choosing.');
        setState(STATE_CHOOSE);
        return;
      }

      let transferResult = creep.myTransfer(nuker, creep.mainCargo());
      if (transferResult == OK) {
        creep.logDebug('Delivering ' + creep.mainCargo());
      } else if (transferResult == ERR_NOT_IN_RANGE) {
        creep.logDebug('Moving to nuker.');
        myTravelTo(nuker);
        return;
      } else {
        creep.logError('Unexpected transfer (to nuker) result. I am confused. Resetting.');
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
    }
  }

  function doLoadPowerSpawn() {
    // Gather one load of stuff and deliver to the power spawn.
    let powerSpawn = creep.room.powerSpawn;

    if (!powerSpawn) {
      creep.logError('Unable to identify a power spawn.');
      setState(STATE_CHOOSE);
      repeat = false;
      return;
    }

    if (creep.memory.subState == 0) {
      // Move to terminal.
      if (creep.pos.isNearTo(creep.room.activeTerminal)) {
        creep.logDebug('Reached terminal. Loading.');
        creep.memory.subState = 1;
      } else {
        creep.logDebug('Moving to terminal.');
        myTravelTo(creep.room.activeTerminal);
        return;
      }
    }

    if (creep.memory.subState == 1) {
      // Load power, then energy.
      let powerNeed = powerSpawn.powerCapacity - powerSpawn.power;
      let energyNeed = powerSpawn.energyCapacity - powerSpawn.energy;
      let myCapacity = creep.store.getFreeCapacity();

      if (powerNeed && !creep.store.power && creep.room.activeTerminal.store.power && myCapacity) {
        let amount = Math.min(powerNeed, creep.room.activeTerminal.store.power, myCapacity);
        let withdrawResult = creep.withdraw(creep.room.activeTerminal, RESOURCE_POWER, amount);
        if (withdrawResult == OK) {
          creep.logDebug('Loading ' + amount + ' power from creep.storage.');
        } else if (withdrawResult == ERR_NOT_IN_RANGE) {
          myTravelTo(creep.room.activeTerminal);
        } else {
          creep.logError(`Unexpected withdraw result (${withdrawResult}). Dumping.`);
          creep.logError(`Was trying to withdraw ${amount} power from terminal, which has ` +
              `${creep.room.activeTerminal.store.power}`);
          setState(STATE_DUMP_TO_STORAGE);
          repeat = false;
        }
        return;
      }

      if (energyNeed &&
          !creep.store.energy &&
          creep.room.activeTerminal.store.energy &&
          myCapacity) {
        let amount = Math.min(energyNeed, creep.room.activeTerminal.store.energy, myCapacity);
        let withdrawResult = creep.withdraw(creep.room.activeTerminal, RESOURCE_ENERGY, amount);
        if (withdrawResult == OK) {
          creep.logDebug('Loading ' + amount + ' energy from creep.storage.');
        } else if (withdrawResult == ERR_NOT_IN_RANGE) {
          myTravelTo(creep.room.activeTerminal);
        } else {
          creep.logError(`Unexpected withdraw result (${withdrawResult}). Dumping.`);
          creep.logError(`Was trying to withdraw ${amount} energy from terminal, which has ` +
              `${creep.room.activeTerminal.store.enegy}`);
          setState(STATE_DUMP_TO_STORAGE);
          repeat = false;
        }
        return;
      }

      creep.logDebug('Done loading. Delivering.');
      creep.memory.subState = 2;
    }

    if (creep.memory.subState == 2) {
      // Deliver.
      if (creep.isEmpty) {
        creep.logDebug('Done delivering. Choosing.');
        setState(STATE_CHOOSE);
        return;
      }

      let resourceType = creep.mainCargo();
      let transferResult = creep.myTransfer(powerSpawn, resourceType);
      if (transferResult == OK) {
        creep.logDebug('Delivering ' + creep.mainCargo());
      } else if (transferResult == ERR_NOT_IN_RANGE) {
        creep.logDebug('Moving to powerSpawn.');
        myTravelTo(powerSpawn);
        return;
      } else {
        creep.logError('Unexpected transfer (to power spawn) result: ' +
          transferResult + '. I am confused. Resetting.');
        creep.logError('Was trying to transfer ' + creep.store[resourceType] + ' ' + resourceType);
        creep.logError(`ps e = ${powerSpawn.energy} ps p=${powerSpawn.power}`);
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
    }
  }

  function doUnloadTerminal() {
    if (!creep.isEmpty || !creep.room.terminal) {
      // Dump everything to creep.storage.
      setState(STATE_DUMP_TO_STORAGE);
      return;
    } else {
      // Pick up whatever resource the terminal has most in excess of max.
      let excess = creep.room.terminal.getExcess();
      if (_.keys(excess).length == 0) {
        // Weird. How'd we even get into this state?
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
      let resource = _.keys(excess)
        .reduce(function(a, b) {
          return excess[a] > excess[b] ? a : b
        });
      let amount = Math.min(storeCapacity, excess[resource]);

       let withdrawResult = creep.withdraw(creep.room.terminal, resource, amount);
      if (withdrawResult == OK) {
        return;
      } else if (withdrawResult == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.room.terminal);
      } else {
        creep.logError('Unexpected withdraw result (' + withdrawResult +
          ') on withdrawing ' + amount + ' ' + resource +
          ' from terminal. Resetting.');
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
    }
  }

  function shouldLoadBoostLab() {
    if (!creep.room.boostLab ||
        !creep.room.boostloaderPos ||
        !creep.room.boostloaderPos.length ||
        creep.room.boostLab.servingController) {
      return false;
    }

    let prepTime = creep.pos.getRangeTo(creep.room.boostloaderPos[0]) + 4;
    return creep.room.ticksUntilBoost() < prepTime;
  }

  function doLoadBoostLab() {
    if (!creep.room.boostloaderPos ||
        !creep.room.boostloaderPos.length ||
        creep.room.boostloaderPos.length > 2) {
      creep.logError(`I need the boostloaderPos array to be either one or two elements.`);
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    if (!creep.room.labs.length) {
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    if (!_.any(creep.room.boostloaderPos, p => p.isEqualTo(creep.pos))) {
      myTravelTo(creep.pos.findClosestByPath(creep.room.boostloaderPos), {range:0});
      return;
    }

    const nextBoost = creep.room.nextBoost();
    const lab = creep.room.boostLab;
    const dump = creep.room.terminal;

    let terminalAccessPos = creep.room.terminal.pos.findClosestByRange(creep.room.boostloaderPos);
    let labAccessPos = creep.room.boostLab.pos.findClosestByRange(creep.room.boostloaderPos);
    let desiredPosition = creep.pos;

    if (!creep.isEmpty) {
      if (!nextBoost) {
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }

      if (creep.store.energy && lab.energy < lab.energyCapacity) {
        if (creep.myTransfer(lab, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          desiredPosition = labAccessPos;
        } else {
          desiredPosition = terminalAccessPos;
        }
      } else if (creep.store[nextBoost.resourceType] && nextBoost.amount > 0) {
        if (lab.mineralType == nextBoost.resourceType || !lab.mineralAmount) {
          if (creep.myTransfer(lab, nextBoost.resourceType, nextBoost.amount) == ERR_NOT_IN_RANGE) {
            desiredPosition = labAccessPos;
          } else {
            desiredPosition = terminalAccessPos;
          }
        }
      } else {
        creep.myTransfer(dump, creep.mainCargo());
        desiredPosition = terminalAccessPos;
      }
    } else {
      if (!nextBoost) {
        setState(STATE_CHOOSE);
        return;
      }

      let amountToWithdraw = Math.min(Math.abs(nextBoost.amount), creep.store.getFreeCapacity());
      if (nextBoost.amount > 0) {
        if (creep.withdraw(dump, nextBoost.resourceType, amountToWithdraw) == ERR_NOT_IN_RANGE) {
          desiredPosition = terminalAccessPos;
        } else {
          desiredPosition = labAccessPos;
        }
      } else if (nextBoost.amount < 0) {
        if (creep.withdraw(lab, nextBoost.resourceType, amountToWithdraw) == ERR_NOT_IN_RANGE) {
          desiredPosition = labAccessPos;
        } else {
          desiredPosition = terminalAccessPos;
        }
      }
    }

    if (!creep.pos.isEqualTo(desiredPosition)) {
      myTravelTo(desiredPosition, {range:0});
      // TODO: Why is this here? What was I trying to debug?
      creep.say(`${creep.nextPos.x},${creep.nextPos.y}`, true);
      creep.logError(`${creep.nextPos.x},${creep.nextPos.y}`);
    }
  }

  function doLoadTerminal() {
    if (creep.memory.subState == 0) {
      // Pick up whatever resource the terminal needs the most of.
      let need = creep.room.activeTerminal.getNeed();
      if (_.sum(need) == 0) {
        creep.logError(`Trying to load terminal, but terminal needs nothing.`);
        setState(STATE_CHOOSE);
        return;
      }
      let resource = _.max(_.pairs(need), s => s[1])[0];
      let amount = Math.min(storeCapacity, need[resource]);
      let withdrawResult = creep.withdraw(creep.storage, resource, amount);

      if (withdrawResult == OK) {
        creep.logDebug('Loading ' + amount + ' ' + resource + ' from creep.storage.');
        creep.memory.subState = 1;
      } else if (withdrawResult == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.storage);
      } else {
        creep.logError('Unexpected withdraw result (' + withdrawResult +
          ') on withdrawing ' + amount + ' ' + resource +
          ' from creep.storage. Resetting.');
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
    if (creep.myTransfer(creep.room.activeTerminal, resource) == ERR_NOT_IN_RANGE) {
      myTravelTo(creep.room.activeTerminal);
    } else {
      creep.logDebug('Transferring ' + creep.store[resource] + ' ' + resource + ' to terminal.');
    }
  }

  function doServiceLabs() {
    const freeCapacity = creep.store.getFreeCapacity();

    if (creep.memory.subState == 0) {
      if (freeCapacity == 0) {
        creep.logDebug('doServiceLabs, full creep, ready to deliver.');
        creep.memory.subState = 1;
        repeat = true;
        return;
      }

      // Get all the needy labs.
      let needyLabs = _.filter(creep.room.labs, l => l.neededMinerals > 0);

      if (!needyLabs.length) {
        creep.logDebug('doServiceLabs loadFromTerminal no more needy labs.');
        creep.memory.subState = 1;
        repeat = true;
        return;
      }

      // Calculate the total need.
      let need = {};
      for (let i = 0; i < needyLabs.length; i++) {
        let lab = needyLabs[i];
        need[lab.neededMineralType] = (need[lab.neededMineralType] || 0) + lab.neededMinerals;
      }

      // Trim the needs to match what's available in terminal and aboard me.
      for (let resource in need) {
        let myResource = creep.store[resource] || 0;
        let storageResource = creep.room.activeTerminal.store[resource] || 0;

        need[resource] = Math.min(need[resource] - myResource, storageResource);
      }

      // Load the largest need.
      let resourceToGet =
          Object.keys(need).reduce(function(a, b) {return need[a] > need[b] ? a : b});

      if (need[resourceToGet] <= 0) {
        creep.logDebug('doServiceLabs loadFromTerminal load meets all needs.');
        creep.memory.subState = 1;
        repeat = true;
        return;
      }

      // Load from terminal.
      let loadAmount = Math.max(0,Math.min(need[resourceToGet], freeCapacity));
      let withdrawResult = creep.withdraw(creep.room.activeTerminal, resourceToGet, loadAmount);
      if (withdrawResult == OK) {
        creep.logDebug('Loading ' + loadAmount + ' ' + resourceToGet + ' from terminal.');
        return;
      } else if (withdrawResult == ERR_NOT_IN_RANGE) {
        creep.logDebug('Moving to terminal');
        myTravelTo(creep.room.activeTerminal);
        return;
      } else {
        creep.logError('doServiceLabs unexpected withdraw from terminal result ' + withdrawResult);
        creep.logError(`(${creep.room.link}) was trying to withdraw ${loadAmount} ${resourceToGet}`);
        creep.logError(`need = ${need[resourceToGet]} freeCapacity=${freeCapacity}`);
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
    }

    if (creep.memory.subState == 1) {
      // Deliver to labs.
      if (creep.isEmpty) {
        creep.logDebug('doServiceLabs deliverToLabs empty.');
        creep.memory.subState = 2;
        repeat = true;
        return;
      }

      // Find the nearest needy lab.
      let lab = creep.pos.findClosestByPath(creep.room.labs, {
          filter: s => s.neededMinerals > 0 && creep.store[s.neededMineralType]
      });

      if (!lab) {
        creep.logDebug('doServiceLabs deliverToLabs no more needy labs.');
        creep.memory.subState = 2;
        repeat = true;
        return;
      }

      // Give to that lab.
      let transferAmount = Math.min(lab.neededMinerals, creep.store[lab.neededMineralType]);

      let transferResult = creep.myTransfer(lab, lab.neededMineralType, transferAmount);
      creep.logDebug('doServiceLabs deliverToLabs transferring ' +
          transferAmount +
          ' ' +
          lab.neededMineralType +
          ' to lab.');
      if (transferResult == OK) {
        //
      } else if (transferResult == ERR_NOT_IN_RANGE) {
        creep.logDebug('doServiceLabs deliverToLabs moving to lab.');
        myTravelTo(lab);
      } else {
        creep.logError('doServiceLabs deliverToLabs unexpected transferResult ' + transferResult);
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }

    }

    if (creep.memory.subState == 2) {
      if (freeCapacity == 0) {
        creep.logDebug('doServiceLabs, full creep, ready to dump.');
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }

      // Load from labs.
      let nearestLab = creep.pos.findClosestByPath(
          creep.room.labs,
          {filter: s => s.excessMinerals > 0 && (s.excessMinerals >= 100 || s.urgent)}
      );

      if (!nearestLab) {
        creep.logDebug('doServiceLabs no more labs with excess.');
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }

      let withdrawAmount = Math.min(nearestLab.excessMinerals, creep.store.getFreeCapacity());
      let withdrawResult = creep.withdraw(nearestLab, nearestLab.mineralType, withdrawAmount);

      if (withdrawResult == OK) {
        creep.logDebug('Loading ' + withdrawAmount + ' ' + nearestLab.mineralType + ' from lab.');
      } else if (withdrawResult == ERR_NOT_IN_RANGE) {
        creep.logDebug('Moving to lab');
        myTravelTo(nearestLab);
      } else {
        creep.logError('doServiceLabs unexpected withdraw from lab result ' + withdrawResult);
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
    }
  }

  function doLoadTowers() {
    if (creep.memory.subState == 0) {
      if (creep.store.getFreeCapacity() == 0) {
        creep.logDebug('Full of energy. Filling towers.');
        creep.memory.subState = 1;
      } else {
        // Load energy from creep.storage.
        let result = creep.withdraw(creep.storage, RESOURCE_ENERGY);
        if (result == ERR_NOT_IN_RANGE) {
          creep.logDebug('Moving to storage to get energy for towers.');
          myTravelTo(creep.storage);
        } else if (result == OK) {
          creep.logDebug('Loading energy for towers.');
        } else {
          setState(STATE_DUMP_TO_STORAGE);
        }
      }
    }

    if (creep.memory.subState == 1) {
      // Deliver to towers until out of towers or out of energy or all
      // towers are full. OR UNTIL I NEED TO BOOST.
      if (creep.isEmpty) {
        creep.logDebug('Out of energy. Choosing new task.');
        setState(STATE_CHOOSE);
        return;
      }

      if (shouldLoadBoostLab()) {
        setState(STATE_LOAD_BOOST_LAB);
        return;
      }

      let needyTowers = _.filter(
          _.difference(creep.room.activeTowers, creep.room.craneTowers),
          s => s.energy < s.energyCapacity
      );

      let veryNeedyTowers = _.filter(needyTowers,
        s => s.store.getFreeCapacity(RESOURCE_ENERGY) > 100
      );

      if (!veryNeedyTowers.length) {
        creep.logDebug('Towers are full. Dumping to storage.');
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }

      let neediest = _.min(needyTowers, 'energy');

      if (!neediest) {
        creep.logDebug('Done filling towers.');
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }

      if (creep.myTransfer(neediest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(neediest);
      } else {
        creep.logDebug('Filling tower.');
      }
    }
  }

  function doLoadLabEnergy() {
    if (creep.memory.subState == 0) {
      // Load up. N.B. might begin partially loaded.
      if (creep.store.getFreeCapacity()) {
        if (creep.withdraw(creep.room.terminal, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
          myTravelTo(creep.room.terminal);
          return;
        }
      }
      // If we're already full, or if this load is successful, fall through to get
      // moving.
      creep._actFull = true;
      creep.memory.subState = 1;
    }

    if (creep.store.energy == 0 && !creep._actFull) {
      setState(STATE_CHOOSE);
      return;
    }

    let needyLabs = _.filter(creep.room.labs, s => s.energy < s.energyCapacity);

    let nearestNeedyLab = creep.pos.findClosestByPath(needyLabs, {ignoreCreeps: true});

    if (needyLabs.length && !nearestNeedyLab) {
      creep.logError(Game.time + ' Confused. There are needyLabs, but none is nearest.');
      creep.logError('needyLabs=' + needyLabs);
      creep.logError('nearestNeedyLab=' + nearestNeedyLab);
      return;
    }

    if (!nearestNeedyLab) {
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    if (creep.myTransfer(nearestNeedyLab, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
      myTravelTo(nearestNeedyLab);
    }
  }

  function doRenew() {
    creep.logDebug('doRenew');

    let nearestSpawn = findNearestRenewSpawn();

    if (creep.ticksToLive > 1100 || !nearestSpawn) {
      setState(STATE_CHOOSE);
      return;
    }

    myTravelTo(nearestSpawn);
  }

  function doLoadUpgradeContainer() {
    creep.logDebug('doLoadUpgradeContainer');
    if (creep.memory.subState == 0) {
      if (!creep.store.getFreeCapacity()) {
        creep.memory.subState = 1;
      } else {
        let result = creep.withdraw(creep.storage, RESOURCE_ENERGY);
        if (result == ERR_NOT_IN_RANGE) {
          myTravelTo(creep.storage);
        } else if (result == OK) {
          myTravelTo(creep.room.upgradeContainer);
          creep.memory.subState = 1;
        } else {
          creep.logError(`${Game.time} Unexpected return value (${result}) from withdraw. pos = ${creep.pos}`);
          setState(STATE_DUMP_TO_STORAGE);
        }
        return;
      }
    }

    if (creep.memory.subState == 1) {
      if (creep.pos.isNearTo(creep.room.upgradeContainer)) {
        creep.myTransfer(creep.room.upgradeContainer, RESOURCE_ENERGY);
        myTravelTo(creep.storage);
        setState(STATE_DUMP_TO_STORAGE);
        repeat = false;
        return;
      }

      myTravelTo(creep.room.upgradeContainer);
    }
  }

  function doRecoverTombstone() {
    creep.logDebug('doRecoverTombstone');
    // If I'm full, or there are no more tombstones near the storage,
    // we're done.
    if (!creep.store.getFreeCapacity()) {
      creep.logDebug('Full. Dumping to storage.')
      creep.logDebug('carrying ' + JSON.stringify(creep.store));
      setState(STATE_DUMP_TO_STORAGE);
      //repeat = false;
      return;
    }

    let stonesNearStorage = creep.storage.pos.findInRange(
        FIND_TOMBSTONES,
        MAX_TOMBSTONE_DISTANCE,
        {filter: t => _.sum(t.store) && t.pos.isSafe()}
    );

    if (!stonesNearStorage.length) {
      creep.logDebug('No more loot. Dumping to storage.')
      creep.logDebug('carrying ' + JSON.stringify(creep.store));
      setState(STATE_DUMP_TO_STORAGE);
      repeat = false;
      return;
    }

    let nearestStone = creep.pos.findClosestByPath(stonesNearStorage);
    if (nearestStone &&
        creep.withdraw(nearestStone, nearestStone.mainCargo()) == ERR_NOT_IN_RANGE) {
      myTravelTo(nearestStone);
    }
  }

  function doRecoverPile() {
    if (!creep.store.getFreeCapacity()) {
      creep.logDebug('Full. Dumping to storage.')
      creep.logDebug('carrying ' + JSON.stringify(creep.store));
      setState(STATE_DUMP_TO_STORAGE);
      repeat = false;
      return;
    }

    let piles = creep.storage.pos.findInRange(FIND_DROPPED_RESOURCES, 12);
    let safePiles = _.filter(piles, p => p.pos.isSafe());
    let nearest = creep.pos.findClosestByPath(safePiles);

    if (!nearest) {
      creep.logDebug('No more loot. Dumping to storage.')
      creep.logDebug('carrying ' + JSON.stringify(creep.store));
      setState(STATE_DUMP_TO_STORAGE);
      repeat = false;
      return;
    }

    if (creep.pickup(nearest) == ERR_NOT_IN_RANGE) {
      creep.logDebug('Moving toward pile at ' + nearest.pos);
      myTravelTo(nearest);
    }
  }

  function doLootRuin() {
    if (!creep.store.getFreeCapacity()) {
      setState(STATE_DUMP_TO_STORAGE);
      repeat = false;
      return;
    }

    let ruins = creep.storage.pos.findInRange(FIND_RUINS, 9, {filter: r => _.sum(r.store)});

    if (!ruins.length) {
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    let safeRuins = _.filter(ruins, p => p.pos.isSafe());
    let nearest = creep.pos.findClosestByPath(safeRuins);

    if (!nearest) {
      setState(STATE_DUMP_TO_STORAGE);
      repeat = false;
      return;
    }

    if (creep.withdraw(nearest, nearest.store.mostValuableThing) == ERR_NOT_IN_RANGE) {
      myTravelTo(nearest);
    }
  }

  function doServiceFactory() {
    let factory = creep.room.factory;

    if (!factory) {
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    if (!_.sum(factory.urgentNeeds) &&
        !_.sum(factory.urgentExcess) &&
        !factoryWantsWhatIHave() &&
        _.sum(factory.needs) + _.sum(factory.excess) < 1500) {
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    if (!creep.pos.isEqualTo(creep.room.factoryServerPosition)) {
      myTravelTo(creep.room.factoryServerPosition, {range:0});
      return;
    }

    creep.logDebug(`factory store: ${JSON.stringify(factory.store)}`);
    creep.logDebug(`factory wants: ${JSON.stringify(factory.wants)}`);
    creep.logDebug(`factory needs: ${JSON.stringify(factory.needs)}`);
    creep.logDebug(`factory excess: ${JSON.stringify(factory.excess)}`);

    function factoryWantsWhatIHave() {
      let resourceType = creep.mainCargo();
      return resourceType && factory.wants[resourceType] > 0;
    }

    function dumpToFactory() {
      let resourceType = creep.mainCargo();
      let amount = Math.min(creep.store[resourceType], factory.wants[resourceType]);
      creep.logDebug(`transferring ${amount} ${resourceType} to factory`);
      creep.myTransfer(factory, resourceType, amount);
    }

    function dumpToTerminal() {
      creep.logDebug(`dumping ${creep.mainCargo()} to terminal`);
      creep.myTransfer(creep.room.terminal, creep.mainCargo());
    }

    function loadFromFactory() {
      let resourceType = _.sample(_.keys(factory.excess));
      let amount = Math.min(creep.store.getFreeCapacity(), factory.excess[resourceType]);
      creep.logDebug(`loading ${amount} ${resourceType} from factory`);
      creep.withdraw(creep.room.factory, resourceType, amount);
    }

    function loadFromTerminal() {
      let resourceType = _.sample(_.keys(factory.urgentNeeds)) || _.sample(_.keys(factory.needs));
      let amount = Math.min(creep.store.getFreeCapacity(), factory.needs[resourceType]);
      creep.logDebug(`loading ${amount} ${resourceType} from terminal`);
      creep.withdraw(creep.room.terminal, resourceType, amount);
    }

    if (_.sum(creep.store)) {
      if (factoryWantsWhatIHave()) {
        dumpToFactory();
      } else {
        dumpToTerminal();
      }
    } else {
      if (_.sum(factory.excess)) {
        loadFromFactory();
      } else {
        loadFromTerminal();
      }
    }
  }

  function doDumpToStorage() {
    // Dump whatever you're carrying to storage, then go back to STATE_CHOOSE.
    if (creep.isEmpty) {
      creep.logDebug('Done dumping. Choosing new task.');
      setState(STATE_CHOOSE);
      return;
    }

    let dumpTarget;

    if (!creep.room.activeTerminal || creep.room.activeTerminal.servingController) {
      dumpTarget = creep.storage;
    } else if (creep.room.activeTerminal && creep.room.memory.shutdown) {
      dumpTarget = creep.room.activeTerminal;
    } else {
      dumpTarget = creep.pos.findClosestByPath(_.compact([creep.storage, creep.room.activeTerminal]));
    }

    if (!dumpTarget || !dumpTarget.store.getFreeCapacity()) {
      let eligibleReceivers = _.compact(
          _.union(
              [creep.room.upgradeContainer, creep.room.storageLink],
              creep.room.towers,
              [creep.storage, creep.room.activeTerminal]));
      eligibleReceivers = _.filter(eligibleReceivers, s => s.store.getFreeCapacity(RESOURCE_ENERGY));
      dumpTarget = creep.pos.findClosestByPath(eligibleReceivers);
    }

    if (dumpTarget && creep.myTransfer(dumpTarget, creep.mainCargo()) == ERR_NOT_IN_RANGE) {
      myTravelTo(dumpTarget);
    }
  }

  function doUnloadTowersAndLabs() {
    let nearest = creep.pos.findClosestByPath(
      _.union(creep.room.towers, creep.room.labs),
      {filter: c => c.energy});

    if (!nearest || creep.memory.subState > 2) {
      setState(STATE_DUMP_TO_STORAGE);
    } else if (creep.store.energy == storeCapacity) {
      if (creep.myTransfer(creep.room.activeTerminal, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.room.activeTerminal, {range: 1});
      } else {
        creep.memory.subState++;
      }
    } else {
      if (creep.withdraw(nearest, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
        myTravelTo(nearest, {range: 1});
      }
    }
  }

  function findLabCleanupSpot() {
    let servingLab = _.find(creep.room.labs, 'servingController');
    if (!servingLab) {
      return;
    }

    let directionToTerminal = servingLab.pos.getDirectionTo(creep.room.terminal);
    let servingSpot = servingLab.pos.oneStep(directionToTerminal);

    return servingSpot;
  }

  function doCleanupController() {
    let servingLab = _.find(creep.room.labs, 'servingController');

    if (!servingLab || (!servingLab.energy && !servingLab.mineralAmount)) {
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    let labCleanupSpot = findLabCleanupSpot();
    myTravelTo(labCleanupSpot, {range: 0});

    if (!creep.isEmpty) {
      creep.myTransfer(creep.room.terminal, creep.mainCargo());
    } else if (servingLab.mineralAmount) {
      creep.withdraw(servingLab, servingLab.mineralType);
    } else {
      creep.withdraw(servingLab, RESOURCE_ENERGY);
    }
  }

  function doLoadStorageLink() {
    if (creep.store.getUsedCapacity() != creep.store.energy) {
      creep.logError(`I somehow got into STATE_LOAD_STORAGE_LINK holding stuff other than energy.`);
      setState(STATE_DUMP_TO_STORAGE);
      return;
    }

    if (creep.memory.subState == 0) {
      if (creep.store.getFreeCapacity() == 0) {
        creep.memory.subState = 1;
      } else {
        creep.withdraw(creep.storage, RESOURCE_ENERGY);
        myTravelTo(creep.storage, {range:1});
      }
    }

    if (creep.memory.subState == 1) {
      if (!creep.store.getUsedCapacity()) {
        setState(STATE_CHOOSE);
        return;
      } else if (!creep.room.storageLink.store.getFreeCapacity(RESOURCE_ENERGY)) {
        setState(STATE_DUMP_TO_STORAGE);
        return;
      }
      creep.myTransfer(creep.room.storageLink, RESOURCE_ENERGY);
      myTravelTo(creep.room.storageLink, {range:1});
    }
  }

  function doCustom() {
  }

  if (creep.spawning) {
    return;
  }

  creep.doDieIfNuke(10);

  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_CHOOSE:
        doChoose();
        break;
      case STATE_EMPTY_LINK:
        doEmptyLink();
        break;
      case STATE_LOAD_NUKER:
        doLoadNuker();
        break;
      case STATE_LOAD_POWER_SPAWN:
        doLoadPowerSpawn();
        break;
      case STATE_UNLOAD_TERMINAL:
        doUnloadTerminal();
        break;
      case STATE_LOAD_BOOST_LAB:
        doLoadBoostLab();
        break;
      case STATE_LOAD_TERMINAL:
        doLoadTerminal();
        break;
      case STATE_SERVICE_LABS:
        doServiceLabs();
        break;
      case STATE_LOAD_TOWERS:
        doLoadTowers();
        break;
      case STATE_LOAD_LAB_ENERGY:
        doLoadLabEnergy();
        break;
      case STATE_RENEW:
        doRenew();
        break;
      case STATE_LOAD_UPGRADE_CONTAINER:
        doLoadUpgradeContainer();
        break;
      case STATE_RECOVER_TOMBSTONE:
        doRecoverTombstone();
        break;
      case STATE_RECOVER_PILE:
        doRecoverPile();
        break;
      case STATE_LOOT_RUIN:
        doLootRuin();
        break;
      case STATE_UNLOAD_TOWERS_AND_LABS:
        doUnloadTowersAndLabs();
        break;
      case STATE_CLEANUP_CONTROLLER:
        doCleanupController();
        break;
      case STATE_SERVICE_FACTORY:
        doServiceFactory();
        break;
      case STATE_DUMP_TO_STORAGE:
        doDumpToStorage();
        break;
      case STATE_LOAD_STORAGE_LINK:
        doLoadStorageLink();
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_CHOOSE);
        break;
    }
    stateLog.push({
      state: creep.memory.state,
      subState: creep.memory.subState
    });
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
  requestSpawn,
  run
};