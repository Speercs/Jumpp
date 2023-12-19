'use strict';

let Alert = require('util_alert');
let Books = require('util_books');

let Archer = require('role_archer');
let Basecourier = require('role_basecourier');
let Builder = require('role_builder');
let Crane = require('role_crane');
let Drone = require('role_drone');
let Firefighter = require('role_firefighter');
let Loader = require('role_loader');
let Upgrader = require('role_upgrader');

let Market = require('util_market');
let Nav = require('util_nav');
let Observe = require('util_observe');
let SpawnJob = require('util_spawnJob');
let Varzs = require('util_varzs');

let Autobuild = require('room_components_autobuild');
let Claim = require('room_components_claim');
let Digsite = require('room_components_digsite');
let PowerBank = require('room_components_powerBank');
let Safemode = require('room_components_safemode');
let Sharders = require('room_components_sharders');
let Shifter = require('room_components_shifter');
let Threat = require('room_components_threat');

let Boost = require('room_role_base_boost');
let Labs = require('room_role_base_labs');
let Monitor = require('room_role_base_monitor');
let Nuker = require('room_role_base_nuker');
let ServeController = require('room_role_base_serveController');

let Loot = require('room_components_loot');

// Run builders to reinforce against nukes if this much.
const NUKER_BUILDER_ENERGY = 150000;

// Go to market to get more energy if we have less than this much.
const MAX_GO_SHOPPING_ENERGY = 200000; // NOT YET IMPLEMENTED

// Send energy to other bases if at least this much...
const BALANCE_ENERGY = 400000;

// ...but only to bases with less than this much. 
const BALANCE_ENERGY_RECEIVER_MAX = 250000;

// ...and if the base has less than this much, disregard its max balance range.
const EMERGENCY_ENERGY_LEVEL = 150000;

// Amount of power to designate as 'reserve'
const RESERVE_POWER = 20000;

// Run a builder to work urgent walls if at least this much.
const URGENT_WALLS_ENERGY = 250000;

// Clear power backlog if at least this much energy.
const MIN_CLEAR_POWER_BACKLOG_ENERGY = 300000;

// Process in excess of reserve if at least this much energy.
const MIN_PROCESS_EXCESS_POWER_ENERGY = 350000;

// Process reserve power if at least this much energy.
const MIN_PROCESS_RESERVE_POWER_ENERGY = 550000;

// Run a builder full-time if at least this much.
const ONE_BUILDERS_ENERGY = 650000;

// Run W15 upgraders 24/7 if at least this much.
const FULL_TIME_UPGRADERS_ENERGY = 675000;

// Run two builders if at least this much.
const TWO_BUILDERS_ENERGY = 700000;

function parseRepairs(room) {
  let repairEvents = room.groupedEvents[EVENT_REPAIR];

  for (let i in repairEvents) {
    let event = repairEvents[i];
    let target = Game.getObjectById(event.data.targetId);
    if (target &&
        target.structureType == STRUCTURE_RAMPART &&
        target.hits - event.data.amount < 100000 &&
        target.hits >= 100000) {
      room.memory._lastRampartTo100k = Game.time;
      room.checkRampart(target);
    }
  }
}

function reportPowerDelivered(room, creep, amount) {
  let workRoomMem = Memory.rooms[creep.memory.workRoom];

  if (!workRoomMem) {
    room.logError(`${creep.name} is delivering power and doesn't have a workRoom.`);
    return;
  }

  if (!workRoomMem.powerBanks) {
    room.logError(`${creep.name} is delivering power and its workRoom ` +
        `(${creep.memory.workRoom} doesn't know anythin about power banks.`);
    return;
  }

  let bankMem = workRoomMem.powerBanks[creep.memory.target];

  if (!bankMem) {
    room.logError(`${creep.name} is delivering power and its workRoom ` +
        `(${creep.memory.workRoom} doesn't recognize the bank id.`);
    return;
  }

  bankMem.powerDelivered = (bankMem.powerDelivered || 0) + amount;
  room.logDebug(`Logging ${amount} power delivered from ${creep.memory.workRoom}`);

  // workRoom is not an error. Logging it as 'delievered' to its source adds to both the source
  // room's delivered value and the destination base's delivered. These values have different
  // meanings. The source room delivered can be compared to the source room's pickedUp, to measure
  // loss in delivery from that room. Destination base delivered is total energy delivered to that
  // base from any source.
  Books.logPower(creep.memory.workRoom, 'delivered', amount);
}

function parseTransfers(room) {
  for (let i in room.groupedEvents[EVENT_TRANSFER]) {
    let event = room.groupedEvents[EVENT_TRANSFER][i];

    // Quick out
    if (event.data.resourceType != RESOURCE_POWER) {
      continue;
    }

    let source = Game.getObjectById(event.objectId);
    let target = Game.getObjectById(event.data.targetId);
    if (source &&
        source.memory &&
        source.memory.role == 'bankhauler' &&
        target &&
        target.structureType) {
      room.logDebug(`${source.name} delivered ${event.data.amount} power.`);
      reportPowerDelivered(room, source, event.data.amount);
    }
  }
}

function parseEventLog(room) {
  parseRepairs(room);
  parseTransfers(room);
}

function checkThreat(room) {
  let threatLevel = Threat.getThreatLevel(room);
  
  room.threatLevel = threatLevel;

  if (threatLevel == Threat.THREAT_NONE) {
    return;
  }
  
  if (threatLevel == Threat.THREAT_MINOR) {
    //room.logError('Minor threat.');
  }

  if (threatLevel == Threat.THREAT_MAJOR) {
    //room.logError('MAJOR threat.');
  }
}

function operateSpawns(room) {
  if (!room.controller.isPowerEnabled) return;

  room.memory.operateSpawnUntil = Math.max(
      Game.time + 1000,
      room.memory.operateSpawnUntil || 0);
}

// Set alertCondition to ALERT_CONDITION_RED if any ramparts suffer damage from hostile
// players.
// Set ALERT_CONDITION_GREEN if we're at red and no hostile player creeps have visited
// the room in 500 ticks.

const ALL_CLEAR_TIME = 100;

function updateAlertCondition(room) {
  if (room.hostileCreeps.length) {
    room.memory._lastHostileCreep = Game.time;
  }

  if (room.alertCondition != ALERT_CONDITION_RED &&
      (room.memory._lastHostileCreep || 0) < Game.time - 1) {
    // There can't possibly have been any rampart attacks.
    return;
  }

  if (room.ramparts.length == 0) {
    return;
  }

  let rampartAttackEvents = _.filter(
      room.groupedEvents[EVENT_ATTACK],
      e => Game.getObjectById(e.objectId) &&
          Game.getObjectById(e.objectId).hostile &&
          !Game.getObjectById(e.objectId).npc &&
          Game.getObjectById(e.data.targetId).structureType == STRUCTURE_RAMPART);

  _.forEach(rampartAttackEvents, e => room.checkRampart(Game.getObjectById(e.data.targetId)));

  let criticalRampartAttackEvents = _.filter(
      rampartAttackEvents,
      e => Game.getObjectById(e.objectId).pos.tileType == TILE_CRITICAL_WALL);

  if (rampartAttackEvents.length && room.alertCondition != ALERT_CONDITION_RED) {
    let alertMessage = `${Game.time} Going to ALERT_CONDITION_RED. A rampart has been ` +
    `damaged by a hostile player.`
    room.memory._alertCondition = ALERT_CONDITION_RED;
    room.logError(alertMessage);
    Game.notify(alertMessage);
    operateSpawns(room);
    return;
  }
      
  if (room.alertCondition == ALERT_CONDITION_RED) {
    if (room.hostileCreeps.length) {
      room.memory._allClearTime = Game.time + ALL_CLEAR_TIME;
    } else if (Game.time >= room.memory._allClearTime) {
      // All clear. Go back to condition green.
      room.logError(`Going to ALERT_CONDITION_GREEN. Looks clear.`);
  
      delete room.memory._alertCondition;
      delete room.memory._allClearTime;
    }
  }
}

function makeDefenders(room) {
  if (room.alertCondition != ALERT_CONDITION_RED) {
    return;
  }
  
  if (room.controller.level < 7) {
    return;
  }
  
  if (room.labs.length < 3) {
    return;
  }

  let leadTime = 200;
  let myCreeps = _.filter(room.ownedCreeps, c => c.memory.role == 'archer' &&
      (c.spawning || c.ticksToLive >= leadTime));

  let numDesired = 1;
  
  let model = (room.controller.level == 8) ? 3 : 4;
  
  if (myCreeps.length < numDesired) {
    room.logError(`Ordering an archer for ${room.name}.`);
    let rooms = [room.name];
    let flag;
    let workRoom = room.name;
  
    if (Archer.requestSpawn(rooms, model, flag, SpawnJob.PRIORITY_HIGH, workRoom) != OK) {
      room.logError('Failed to order ' + role + '.');
    }
  }
}

function runTowersNoThreat(room) {
  // loop through wounded creeps in any order, applying tower heals in any
  // order. Don't put any effort into optimizing this. It's a low-stakes thing.
  for (let i = 0; i < room.woundedCreeps.length; i++) {
    let creep = room.woundedCreeps[i];
    let availableTowers = _.filter(room.towers, t => !t.busy);
    
    for (let j = 0; j < availableTowers.length && creep.hits + creep.incomingHeal < creep.hitsMax; j++) {
      let tower = availableTowers[j];
      
      let result = tower.heal(creep);
      if (result == OK) {
        tower.busy = true;
        creep.incomingHeal += tower.healAmount(creep);
        Books.logEnergy(room, 'tower', TOWER_ENERGY_COST);
      }
    }
  }
}

function knownNuisance(creep) {
  if (creep.owner.username == 'Trepidimous' &&
      creep.dismantlePower > 1000 &&
      !creep.pos.onEdge &&
      !creep.pos.nearEdge &&
      towerDamageAtPosition(creep.pos) > creep.damageTolerance) {
    return true;
  }

  return false;
}

function killableAtMinorThreat(creep) {
  return creep.pos.findInRange(FIND_MY_CREEPS, 3).length ||
      creep.pos.findInRange(FIND_MY_POWER_CREEPS, 3).length ||
      creep.pos.findInRange(FIND_MY_STRUCTURES, 3, {filter: s => s.naked}).length ||
      creep.pos.findInRange(creep.room.ramparts, 3).length ||
      knownNuisance(creep);
}

function runTowersMinorThreat(room) {
  // Shoot at anything that's within 3 tiles of a friendly creep, naked
  // structure, or rampart.
  let targets = _.filter(room.hostileCreeps, c => killableAtMinorThreat(c));

  // Prefer the ones we can hurt the worst.
  let orderedTargets = _.sortBy(targets, c => c.likelyHeal - towerDamageAtPosition(c.pos));

  if (!orderedTargets.length) {
    maybeTowersHeal(room);
    return;
  }

  // Don't shoot if you can't hurt anyone.
  if (orderedTargets[0].likelyHeal > towerDamageAtPosition(orderedTargets[0].pos)) return;

  for (let i = 0; i < orderedTargets.length; i++) {
    let creep = orderedTargets[i];
    let availableTowers = _.filter(room.towers, t => !t.busy);
    
    for (let j = 0; j < availableTowers.length && (creep.hits + creep.maxHeal - creep.incomingDamage > 0); j++) {
      let tower = availableTowers[j];
      
      let result = tower.attack(creep);
      if (result == OK) {
        tower.busy = true;
        creep.incomingDamage += tower.attackDamage(creep);
        Books.logEnergy(room, 'tower', TOWER_ENERGY_COST);
      }
    }
  }
}

function assessMaxDamage(room) {
  let myHitters = room.find(FIND_MY_CREEPS, {filter: c => c.attackPower});
  let myShooters = room.find(FIND_MY_CREEPS, {filter: c => c.shootPower});
  
  for (let i = 0; i < room.hostileCreeps.length; i++) {
    let creep = room.hostileCreeps[i];
    
    let hittersInRange = creep.pos.findInRange(myHitters, 1);
    let shootersInRange = creep.pos.findInRange(myShooters, 3);
    
    let rawDamage = _.sum(hittersInRange, 'attackPower') +
      _.sum(shootersInRange, 'shootPower') +
      room.towerDamageAtPos(creep.pos);
      
    let oneTickDamage = creep.getEffectiveDamage(rawDamage);
    // TODO: This is WAY too conservative. It uses the current state of the creep's toughs, when
    // oneTickDamage - creep.likelyHeal will likely leave it with significantly degraded armor.
    //let twoTickDamage = creep.getEffectiveDamage(oneTickDamage - creep.likelyHeal + rawDamage);
    //let secondTickDamage = twoTickDamage - oneTickDamage;
    let twoTickHits = creep.getFutureHits(rawDamage, creep.likelyHeal, rawDamage, creep.maxHeal);

    // oneTickNetDamage is the state of the creep if we hit him with everything we can, and he catches
    // every heal he could.
    creep.oneTickNetDamage = Math.max(0, oneTickDamage - creep.maxHeal);
    
    // twoTickNetDamage is the state of the creep if we hit him with everything and he gets only the
    // likelyHeal. Then on the following tick we hit again with everything and the enemy throws
    // every possible heal.
    creep.twoTickNetDamage = Math.max(0, creep.hits - twoTickHits);
  }
}

function maybeTakeWildShot(room) {
  if (Math.floor(Math.random() * 32)) return;

  // Should not be possible, but super easy to handle.
  if (room.hostileCreeps.length == 0) return;

  // Pick a random enemy unit. Fire all towers at it, and also attack with any archers that can reach.
  let index = Math.floor(Math.random() * room.hostileCreeps.length);
  let victim = room.hostileCreeps[index];

  if (!victim) {
    room.logError(`maybeTakeWildShot somehow chose invalid victim.`);
    return;
  }

  attackVictim(room, victim, 'wildShot', /* suppressNotify=*/ true);
  return true;
}

function maybeTowersHeal(room) {
  let myFighters = _.filter(room.myCreeps, c => c.isFighter()).concat(room.myPowerCreeps);

  if (!myFighters.length) {
    return;
  }

  _.forEach(room.towers, function (tower) {
    let needers =
      _.filter(myFighters, c => c.maxDamage + (c.hitsMax - c.hits) - c.incomingHeal > 0);
    let creep = _.max(needers, c => c.maxDamage + (c.hitsMax - c.hits) - c.incomingHeal);
    if (creep && creep.id && tower.heal(creep) == OK) {
      tower.busy = true;
      creep.incomingHeal += tower.healAmount(creep);
      Books.logEnergy(room, 'tower', TOWER_ENERGY_COST);
    }
  });
}

function attackVictim(room, victim, note, suppressNotify) {
  let myArchers = _.filter(room.myCreeps, c => c.memory.role == 'archer');
  for (let archer of myArchers) {
    let range = archer.pos.getRangeTo(victim);
    if (range > 3) continue;
    if (range == 1) {
      // Note: In this case, other hostiles in range which aren't the intended
      // victim won't get their incomingDamage updated. Fixing that is probably more
      // trouble than it's worth.
      archer.myRangedMassAttack();
    } else {
      archer.myRangedAttack(victim);
    }
    victim.incomingDamage += archer.shootPower;
    archer._roomFired = true;
  }
  
  let shotsFired = _.filter(
    room.activeTowers,
    t => t.attack(victim) == OK &&
      (t.busy = true) &&
      (victim.incomingDamage += t.attackDamage(victim))
  ).length;

  try {
    if (!victim.npc && !suppressNotify) {
      let message = `${room.name} firing on ${victim.name} at t=${Game.time}\noneTickNetDamage` +
          `=${victim.oneTickNetDamage}, twoTickNetDamage=${victim.twoTickNetDamage}, likelyHeal=` +
          `${victim.likelyHeal}, maxHeal=${victim.maxHeal}\ntowerDamageAtPos=` +
          `${room.towerDamageAtPos(victim.pos)}, incomingDamage=${victim.incomingDamage}, ` +
          `effectiveDamage=${victim.getEffectiveDamage(victim.incomingDamage)}, note=${note}\n` +
          `victim pos (${victim.pos.x}, ${victim.pos.y}) hits=${victim.hits}`;
      let key = room.name + Alert.Key.TOWER_DEFENSE + victim.id + victim.hits + 0;
      Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.HOURLY, message);
    }
  } catch (err) {
    room.logError(`Failed to send TOWER_DEFENSE message: ${err}`);
  }
  
  Books.logEnergy(room, 'tower', shotsFired * TOWER_ENERGY_COST);
}

function runTowersMajorThreat(room) {
  // Compute the max damage we could do to each invididual target
  assessMaxDamage(room);
  
  // If there are targets with oneTickDamage > 0, pile on the one with
  // highest oneTickDamage.
  // TODO: Instead, choose a random one from among the creeps with nonzero oneTickDamage.
  let victim = _.max(room.hostileCreeps, 'oneTickNetDamage');
  if (victim && victim.oneTickNetDamage) {
    attackVictim(room, victim, 'oneTickNetDamage');
    return;
  }

  // If there are targets with twoTickDamage > 0, pile on the one with
  // highest twoTickDamage.
  // TODO: Instead, choose a random one from among the creeps with nonzero twoTickDamage.
  victim = _.max(room.hostileCreeps, 'twoTickNetDamage');
  if (victim && victim.twoTickNetDamage) {
    attackVictim(room, victim, 'twoTickNetDamage');
    return;
  }

  // We think we can't hurt anyone. Maybe take a random exploratory shot.
  if (maybeTakeWildShot(room)) return;

  // Nothing better to do. Maybe heal someone?
  maybeTowersHeal(room);
}

function runTowers(room) {
  let activeTowers = _.filter(room.activeTowers, t => t.energy >= TOWER_ENERGY_COST);
  
  if (!activeTowers.length) {
    return;
  }
  
  switch (room.threatLevel) {
    case Threat.THREAT_NONE:
      runTowersNoThreat(room);
      break;
    case Threat.THREAT_MINOR:
      runTowersMinorThreat(room);
      break;
    case Threat.THREAT_MAJOR:
      runTowersMajorThreat(room);
      break;
    default:
      room.logError('Invalid threat level.');
      break;
  }
}

function setLinkFlags(room) {
  // TODO: Move this into an on-demand operation. If nobody in the room consumes these flags, we don't need to set them.
  // Note: Crane probably consumes them every tick, so we should see about relaxing that if we're gonna do this.
  if (room.storageLink) {
    room.storageLink._isReceiver = true;
  }
  
  if (room.spawnLink) {
    room.spawnLink._isReceiver = true;
    if (room.spawnLink.store[RESOURCE_ENERGY] == 0) {
      room.storageLink._isReceiver = false;
    }
  }

  if (room.upgradeLink) {
    if (!room.upgradeLink.isDigsiteLink ||
        (Game.time - room.memory._feedUpgradeLink < 2 &&
            Game.time > (room.memory._regenUpgradeLinkDigsite || 0) + 400)) {
      room.upgradeLink._isReceiver = true;
      if (room.storageLink && room.upgradeLink.store[RESOURCE_ENERGY] == 0) {
        room.storageLink._isReceiver = false;
      }
    }
  }
}

function doLinkTransfers(room) {
  setLinkFlags(room);

  let sender = _.find(room.links, l => l.isSendingLink && !l.cooldown && l.store[RESOURCE_ENERGY] > 400);
  if (!sender) return;

  let possibleReceivers = [room.storageLink, room.spawnLink, room.upgradeLink];
  let eligibleReceivers = _.filter(possibleReceivers, l => l && l.isReceivingLink && l.store[RESOURCE_ENERGY] == 0);
  if (eligibleReceivers.length == 0) return;

  let receiver = sender.pos.findClosestByRange(eligibleReceivers);
  if (!receiver) return;

  if (sender.transferEnergy(receiver) == OK) {
    Game.linkIntents = (Game.linkIntents || 0) + 1;
  }
}

function maybeSendEnergy(source, dest, senderMin, receiverTarget, minToSend = 0) {
  let debug = 0;

  if (source.terminal.busy) {
    if (debug) {
      source.logError('source terminal is busy.');
    }
    return;
  }

  if (!dest.terminal || !dest.storage) {
    return;
  }
  
  let theirEnergy = dest.roughEnergy;

  // Count only energy in terminal for servingControllers.
  if (dest.terminal.servingController) {
    theirEnergy = dest.terminal.store[RESOURCE_ENERGY];
  }

  let theirTotalEnergy = theirEnergy + ((dest.terminal.incoming && dest.terminal.incoming[RESOURCE_ENERGY]) || 0);
  let amountTheyNeed = receiverTarget - theirTotalEnergy;
  if (amountTheyNeed <= 0) {
    if (debug) {
      source.logError('they don\'t need any.');
    }
    return;
  }

  let myTotalEnergy = source.roughEnergy;
  let myExcess = Math.max(0, myTotalEnergy - senderMin);
  let mySendableEnergy = Math.floor(Math.min(myExcess, source.terminal.store[RESOURCE_ENERGY]) * 0.5);
  
  if (mySendableEnergy < 100) {
    if (debug) {
      source.logError(`I have too little to send. total=${myTotalEnergy} sendable=${mySendableEnergy}`);
    }
    return;
  }

  let theirTerminalSpace = TERMINAL_CAPACITY - (_.sum(dest.terminal.store) + _.sum(dest.terminal.incoming));
  let theirStorageSpace = dest.storage.storeCapacity - _.sum(dest.storage.store);
  
  let sendAmount = Math.min(mySendableEnergy, Math.max(amountTheyNeed, 100));
  
  if (sendAmount < minToSend) {
    if (debug) {
      source.logError(`Send amount (${sendAmount}) below minimum (${minToSend}).`);
    }
    return;
  }
  
  let transactionCost = Game.market.calcTransactionCost(sendAmount, source.name, dest.name);
    
  if (source.terminal.store.energy >= (transactionCost + sendAmount) &&
    theirTerminalSpace >= sendAmount &&
    theirStorageSpace >= sendAmount) {
    source.logDebug(`with ${myTotalEnergy} sending ${sendAmount} energy to ${dest} ` +
                    `which has ${theirTotalEnergy}.`)
    let sendResult = source.terminal.mySend(RESOURCE_ENERGY, sendAmount, dest.name, 'balance');
    if (sendResult == OK) {
      //source.logError(`Successfully sent ${sendAmount} energy to ${dest.link}. I have ${source.roughEnergy} they have ${dest.roughEnergy}`);
      Books.logEnergy(source, 'terminalLoss', transactionCost);
      Books.logEnergy(source, 'sent', sendAmount);
      Books.logEnergy(dest, 'received', sendAmount);
      if (!dest.terminal.incoming) {
        dest.terminal.incoming = {};
      }
      dest.terminal.incoming[RESOURCE_ENERGY] =
          (dest.terminal.incoming[RESOURCE_ENERGY] || 0) + sendAmount;
      return true;
    } else {
      source.logError('send fail: ' + sendResult);
    }
  } else {
    if (debug) {
      source.logError('Not enough energy.');
      source.logError('source.terminal.store.energy =' + source.terminal.store.energy);
      source.logError('transactionCost = ' + transactionCost);
      source.logError('sentEnergy = ' + sendAmount);
    }
  }
  
  return false;
}

const MAX_ENERGY_BALANCE_DISTANCE = 6;

function balanceEnergy(room) {
  if (!room.terminal || room.terminal.cooldown || room.terminal.busy || room.controller.level < 8) {
    return;
  }
  
  // Each base checks only one other base each tick, cycling through them.
  let index = (room.controller.id.hashCode() + Game.time) % Game.terminalBases.length;
  let base = Game.terminalBases[index];

  if (base == room) {
    return;
  }

  // Don't send to level-8 bases with the terminal still in the
  // serving-controller position.
  if (base.controller.level == 8 && base.terminal.servingController) {
    return;
  }
  
  // Don't send to bases that are shutting down.
  if (base.memory.shutdown) {
    return;
  }

  // Don't send to lw bases.
  if (base.basetype == 'lw') {
    return;
  }

  let distance = Game.map.getRoomLinearDistance(room.name, base.name, true);
  
  let maxDistance = base.memory.maxBalanceDistance || MAX_ENERGY_BALANCE_DISTANCE;

  let inRange = distance <= maxDistance;
  let emergency = base.roughEnergy <= EMERGENCY_ENERGY_LEVEL ||
    (base.activeTerminal && base.activeTerminal.store.energy < 50000);
  
  if (inRange || emergency) {
    // let receiverMinEnergy = (base.controller.level == 8) ? BALANCE_ENERGY_RECEIVER_MAX : 700000;
    let senderReserve = BALANCE_ENERGY;
    let receiverGoal = BALANCE_ENERGY_RECEIVER_MAX;
    let minToSend = 5000;

    if (base.roughEnergy <= EMERGENCY_ENERGY_LEVEL) {
      senderReserve = 100000;
      minToSend = 1000;
    }
    maybeSendEnergy(room, base, senderReserve, receiverGoal, minToSend);
  }
}

let idleUntil = {};
let processUntil = {};

function updatePowerSpawn(room) {
  // quick outs
  if (Game.time < idleUntil[room.name]) {
    return;
  }

  if (Game.time < processUntil[room.name]) {
    let result = room.powerSpawn && room.powerSpawn.processPower();
    if (result != OK) {
      delete processUntil[room.name];
    }
    return;
  }

  let roughPower = room.roughInventory(RESOURCE_POWER);
  if (roughPower < 10000) {
    idleUntil[room.name] = Game.time + 90 + Math.round(Math.random() * 20);
    return;
  }

  let requiredRoomEnergy = roughPower > RESERVE_POWER ?
      MIN_PROCESS_EXCESS_POWER_ENERGY : MIN_PROCESS_RESERVE_POWER_ENERGY;
  let sufficientRoomEnergy = room.roughEnergy > requiredRoomEnergy ||
      (room.nearestVault && room.nearestVault.hasPowerBacklog && room.roughEnergy > MIN_CLEAR_POWER_BACKLOG_ENERGY);
  if ((sufficientRoomEnergy || room.memory.shutdown) &&
      room.powerSpawn &&
      room.powerSpawn.store[RESOURCE_ENERGY] >= POWER_SPAWN_ENERGY_RATIO &&
      room.powerSpawn.store[RESOURCE_POWER]) {
    let result = room.powerSpawn && room.powerSpawn.processPower();
    if (result == OK) {
      processUntil[room.name] = Game.time + 40 + Math.round(Math.random() * 20);
      return;
    }
    return;
  }
  idleUntil[room.name] = Game.time + 90 + Math.round(Math.random() * 20);
  return;
}

function sellEnergy(room) {
  if (!room.terminal ||
    room.terminal.cooldown ||
    room.controller.level < 8 ||
    room.terminal.store.energy < 30000 ||
    room.roughEnergy < Market.LITTLE_ENERGY_AMOUNT ||
    Game.cpu.bucket < 8000) {
    return;
  }
  
  let minimumPrice = room.roughEnergy < Market.MUCH_ENERGY_AMOUNT ? Market.HIGH_ENERGY_PRICE : Market.LOW_ENERGY_PRICE;
  
  if (!Game.orders) {
    Market.setOrders();
  }
  
  if (!Game.orders.energyBuy.length) {
    return;
  }
  
  // Find the order with the highest price.    
  for (let i=0; i < Game.orders.energyBuy.length; i++) {
    let order = Game.orders.energyBuy[i];
    let transactionCost = Game.market.calcTransactionCost(
      order.amount, order.roomName, room.name);
    let netEnergy = order.amount + transactionCost;
    let unitPrice = (order.amount * order.price) / netEnergy;
    order.transactionCost = transactionCost;
    order.netEnergy = netEnergy;
    order.unitPrice = unitPrice;
  }
  
  let best = _.max(Game.orders.energyBuy, 'unitPrice');
  if (best.unitPrice < minimumPrice) {
    //room.logError(`Best effective price is ${best.unitPrice}. Fie!`);
    //room.logError(JSON.stringify(best));
    return;
  }
  
  if (best.type != 'buy') {
    room.logError('Best buy order is not a buy order? wtf?');
    return;
  }
  
  // I want to sell.
  let saleAmount = best.amount;
  let totalAmount = saleAmount + best.transactionCost;
  if (totalAmount > room.terminal.store.energy) {
    saleAmount = Math.floor(room.terminal.store.energy * best.amount / totalAmount);
  }
  
  room.logDebug(`Attempting to sell ${saleAmount} energy at net price ${best.unitPrice}`);
  let result = Game.market.deal(best.id, saleAmount, room.name);
  if (result == OK) {
    room.terminal.busy = true;
  }
}

// Key: roomName
// Value: An array of the roads and containers in the room most in need of repair.
let weakestRoadsAndContainers = {};

function updateWeakRoadsCache(room) {
  let damaged = _.filter(
    _.compact(
        _.union(
            room.roads,
            _.difference(room.containers, room.sourceContainers))),
    s => s.hits <= s.hitsMax - 800);
  weakestRoadsAndContainers[room.name] = _.map(damaged, 'id');
}

function maintainRoadsAndContainers(room) {
  if (!weakestRoadsAndContainers[room.name] || !weakestRoadsAndContainers[room.name].length) {
    return;
  }

  // Cache gets updated in do839.
  
  let target = Game.getObjectById(weakestRoadsAndContainers[room.name][0]);

  while (!target || target.hits > target.hitsMax - 800) {
    weakestRoadsAndContainers[room.name] = _.rest(weakestRoadsAndContainers[room.name]);
    if (!weakestRoadsAndContainers[room.name].length) return;
    target = Game.getObjectById(weakestRoadsAndContainers[room.name][0]);
  }

  // Other unlikely cases.
  if (!room.activeTowers.length || room.hostileCreeps.length > 0) {
    return;
  }
  
  // Critically low on energy?
  if (room.roughEnergy < 100000) {
    if (room.controller.level > 7) {
      return;
    }
    if (room.controller.level > 3 && room.roughEnergy < 25000) {
      return;
    }
  }

  let nearestTower = target.pos.findClosestByRange(room.activeTowers);
  
  if (!nearestTower.busy) {
    Books.logEnergy(room, 'towerRepair', TOWER_ENERGY_COST);
    nearestTower.repair(target);
    Game.towerIntents = (Game.towerIntents || 0) + 1;
  }
}

function makeBasecourier(room) {
  if (room.basecouriers.length &&
    _.any(room.basecouriers, c => c.memory.model >= room.basecourierModel)) {
    return;
  }

  if (room.controller.level < 4 && room.activeTowers.length < 1 && !room.labs.length) {
    return;
  }

  if (!room.mainStore) {
    return;
  }

  if (room.baseType == 'lw') {
    if (room.controller.level >= 6 && room.upgradeLink) return;
    if (room.energyCapacityAvailable < 900) return;
    if (room.mineralContainer && room.storageCrane && room.upgradeLink) return;
  }

  if (room.basecouriers.length && room.basecouriers[0].memory.spawnTime > Game.time - 500) return;

  room.logDebug(`Ordering a basecourier...`);
  try {
    if (Basecourier.requestSpawn(
      [room.name],
      room.basecourierModel,
      /* flag = */ null,
      SpawnJob.PRIORITY_DEFAULT) == OK) {
      room.logDebug(`...success.`);
    } else {
      room.logError(`Failed to queue basecourier.`);
    }
  } catch (err) {
    room.logError(`Exception in Basecourier.requestSpawn: ${err}`);
  }
}

function makeDronesForSource(room, source) {
  function makeDrone(body, initialState) {
    Drone.requestSpawnDetail(
        room,
        body,
        source.id,
        initialState);
  }

  function makeHarvester() {
    makeDrone(Drone.getWorkerBody(room.energyCapacityAvailable), Drone.STATE_HARVEST);
  }

  function makeShuttle() {
    makeDrone(Drone.getShuttleBody(room.energyCapacityAvailable), Drone.STATE_SHUTTLE_LOAD);
  }

  function makeWorker() {
    makeDrone(Drone.getWorkerBody(room.energyCapacityAvailable), Drone.STATE_WORK);
  }

  let myDrones = _.filter(
      room.ownedCreeps,
      c => c.memory.role == 'drone' && c.memory.sourceId == source.id);

  let stateCounts = _.countBy(myDrones, 'memory.state');

  let numHarvesters = stateCounts[Drone.STATE_HARVEST] || 0;
  if (!numHarvesters) {
    makeHarvester();
    return true;
  }

  let numShuttles = (stateCounts[Drone.STATE_SHUTTLE_LOAD] || 0) +
      (stateCounts[Drone.STATE_SHUTTLE_DELIVER] || 0);
  if (!numShuttles) {
    makeShuttle();
    return true;
  }

  let numWorkers = stateCounts[Drone.STATE_WORK] || 0;
  let numWorkersDesired = 1;
  if (!room.constructionSites.length && room.memory._lastConstructTime < Game.time - 50) {
    numWorkersDesired = numHarvesters;
  }
  if (numWorkers < numWorkersDesired) {
    makeWorker();
    return true;
  }

  let numHarvestersDesired = Math.min(3, room.memory.digsites[source.id].maxHarvesters);
  if (numHarvesters < numHarvestersDesired) {
    makeHarvester();
    return true;
  }

  if (numShuttles < room.memory.digsites[source.id].maxHarvesters + 1) {
    makeShuttle();
    return true;
  }

  return false;
}

function makeDrones(room) {
  if (!room.memory.selfboot || room.energyCapacityAvailable >= 800) return;

  if (room.energyAvailable < 300) return;

  for (let source of room.find(FIND_SOURCES)) {
    if (makeDronesForSource(room, source)) return;
  }
}

function makeLoaders(room) {
  if (room.baseType != 'bunker' || !room.storage || !room.storage.active || !room.storage.my) {
    return makeSimpleLoader(room);
  }

  let model = Loader.currentModel(room.energyAvailable);
  let maxModel = Loader.currentModel(room.energyCapacityAvailable);

  // With 50-energy extensions, loader won't need more than 700 for a trip.    
  if (room.controller.level < 7) {
    model = Math.min(model, 7);
    maxModel = Math.min(maxModel, 7);
  // With 50-energy extensions, loader won't need more than 1300 for a trip.
  } else if (room.controller.level < 8) {
    model = Math.min(model, 13);
    maxModel = Math.min(maxModel, 13);
  }
  
  // Count only loaders with renewMe set. Those that don't have it set are
  // asking to be replaced. Replace those that aren't max-model if we're able
  // to make max-model replacements.
  let myLoaders = _.filter(
    room.ownedCreeps,
    c => c.memory.role == 'loader' &&
      c.memory.renewMe &&
      (c.memory.model == maxModel || model < maxModel) || c.memory.spawnTime + 500 > Game.time);
    
  if (myLoaders.length == 3) {
    return;
  }
  
  function makeBunkerLoader(quadrant, mx, my) {
    let loaders = _.filter(myLoaders, c => c.memory.subRole == quadrant);
    if (loaders.length) {
      return;
    }
    let extensions = _.filter(
        room.extensions,
        s => (s.pos.x - room.storage.pos.x) * mx >= 0 &&
            (s.pos.y - room.storage.pos.y) * my >= 0);
    if (extensions.length < 5) {
      return;
    }
    const flag = null;

    if (Loader.requestSpawn([room.name], model, flag, SpawnJob.PRIORITY_HIGH, quadrant) == OK) {
      room.logDebug('Queued ' + quadrant + ' loader.');
    } else {
      room.logError('Failed to queue ' + quadrant + ' loader.');
    }
  }

  makeBunkerLoader('bunkerNE', 1, -1);
  makeBunkerLoader('bunkerSE', 1, 1);
  makeBunkerLoader('bunkerSW', -1, 1);
  makeBunkerLoader('bunkerNW', -1, -1);
}

// For non-bunker rooms, or bunkers that don't yet have storages.
function makeSimpleLoader(room) {
  // Bail if there's nothing to load from.
  if (!room.mainStore || room.mainStore.store.energy < 2000) {
    return;
  }

  let model = Loader.currentModel(room.energyAvailable);
  let maxModel = Loader.currentModel(room.energyCapacityAvailable);
  
  let myLoaders = _.filter( room.ownedCreeps, c => c.memory.role == 'loader');
    
  let myMaxLoaders = _.filter(myLoaders, c => c.memory.model >= maxModel);
  
  // Bail if there's already a max loader.
  if (myMaxLoaders.length) {
    return;
  }
  
  // Bail if there's already a loader, and we can't replace it with the best.
  if (myLoaders.length && model != maxModel) {
    return;
  }

  // Bail if there's a loader we'd like to replace, but it's still really new.
  if (myLoaders.length) {
    let newestLoader = _.max(myLoaders, 'memory.spawnTime');
    if (newestLoader && newestLoader.memory.spawnTime > Game.time - 500) return;
  }

  if (room.memory.noLoaders) return;
    
  if (Loader.requestSpawn(
    [room.name],
    model,
    /* flag = */ null,
    SpawnJob.PRIORITY_HIGH) == OK) {
    room.logDebug('Queued model-' + model + ' loader.');
  } else {
    room.logError('Failed to queue loader.');
  }
}

function makeTiggaBaseSpawnCranes(room) {
  let myCranes = _.filter(room.ownedCreeps, c => c.memory.role == 'crane');
  
  function makeSpawnCrane(quadrant) {
    let cranes = _.filter(myCranes, c => c.memory.subRole == quadrant);
    if (cranes.length) {
      return;
    }
    const SPAWN_CRANE_MODEL = 2;

    if (Crane.requestSpawn(
      room, SPAWN_CRANE_MODEL, SpawnJob.PRIORITY_HIGH, quadrant) == OK) {
      room.logDebug('Queued ' + quadrant + ' crane.');
    } else {
      room.logError('Failed to queue ' + quadrant + ' crane.');
    }
  }

  makeSpawnCrane('spawnNE');
  makeSpawnCrane('spawnSE');
  makeSpawnCrane('spawnSW');
  makeSpawnCrane('spawnNW');
}

function makeFirefighter(room) {
  if (room.baseType == 'lw') return;
  let numHarassers = (room.memory.mineHarassers && _.sum(room.memory.mineHarassers)) || 0;
  let numInvaders = (room.memory.mineInvaders && _.sum(room.memory.mineInvaders)) || 0;
  let numProblems = numHarassers + numInvaders;

  if (room.energyAvailable < 1300 || !numProblems) {
    return;
  }

  let myFirefighters = _.filter(room.ownedCreeps, c => c.memory.role == 'firefighter');

  let myHeavies = _.filter(myFirefighters, c => c.memory.model == 8);

  if (myHeavies.length) {
    return;
  }

  if (myFirefighters.length && numHarassers == 0) {
    return;
  }

  let model = Firefighter.currentModel(room.energyCapacityAvailable);

  if (numHarassers) {
    model = 8;
  }

  if (!model) {
    return;
  }

  room.logDebug(`Ordering a firefighter...`);
  try {
    if (Firefighter.requestSpawn(
      [room.name],
      model,
      room.name,
      SpawnJob.PRIORITY_HIGH) == OK) {
      room.logDebug(`...success.`);
    } else {
      room.logError(`Failed to queue firefighter.`);
    }
  } catch (err) {
    room.logError(`Exception in Firefighter.requestSpawn: ${err}`);
  }
}

function makeStorageCrane(room) {
  if (!room.activeStorage) {
    return;
  }

  if (!room.activeTerminal && (!room.storageLink || !room.storageLink.active)) {
    return;
  }

  let model = room.isVault ? 24 : 8;
  let leadTime = room.baseType == 'tigga' ? 60 : 0;

  if (room.baseType == 'lw') {
    model = 108;
    leadTime = 48;

    if (room.energyAvailable < 800 && room.energyAvailable >= 100) {
      model = Math.floor(room.energyAvailable / 100) + 100;
    }
  } else {
    if (room.energyAvailable < 800 && room.energyAvailable >= 100) {
      model = Math.floor(room.energyAvailable / 100);
    }
  }

  if (room.storageCrane &&
    room.storageCrane.memory.model >= model &&
    (room.storageCrane.ticksToLive > leadTime || room.storageCrane.spawning)) {
    return;
  }
  
  room.logDebug(`Ordering a model-${model} crane...`);
  try {
    if (Crane.requestSpawn(
      room,
      model,
      SpawnJob.PRIORITY_CRITICAL,
      'storage') == OK) {
      room.logDebug(`...success.`);
    } else {
      room.logError(`Failed to queue crane.`);
    }
  } catch (err) {
    room.logError(`Exception in Crane.requestSpawn: ${err}`);
  }
}

function makeCranes(room) {
  if (room.baseType == 'tigga' &&
    room.spawnLink &&
    room.spawnLink.active) {
    makeTiggaBaseSpawnCranes(room);
  }
  
  makeStorageCrane(room);
}

// Occasionally complain about stuff we need and haven't got.
function complainAboutDeficits(room) {
  
  if (room.terminal && room.terminal.servingController) {
    return;
  }
  
  if (!room.memory.labs ||
      !room.memory.labs.execute ||
      !room.memory.labs.orders ||
      !room.memory.labs.orders.length) {
    return;
  }

  let recipe = RECIPES[room.memory.labs.orders[0].resourceType];
  let reagent0 = recipe[0];
  let reagent1 = recipe[1];
  if (room.sourceLabMinerals[reagent0] > 4 &&
      room.sourceLabMinerals[reagent1] > 4) {
    return;
  }
  
  let needs = room.labDeficit();
  
  if (!_.sum(needs)) {
    return;
  }

  let firstNeed = _.keys(needs)[0];
  if (RECIPES[firstNeed]) {
    let amount = Math.ceil(needs[firstNeed] / 5) * 5;
    room.logError(`Unshifting a lab order for ${amount} ${firstNeed}.`);
    room.memory.labs.orders.unshift({resourceType: firstNeed, amount: amount});
  }
}

function warnAboutNukes(room) {
  if (room.nukes.length) {
    let key = creep.name + Alert.Key.INCOMING_NUKE;
    let message = `${room.link} has nukes incoming.`;
    Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);
  }
}

function scoutNeighbors(room) {
  let neighbors = _.filter(room.findControllersInRangeManhattan(5), n => n != room.name);

  for (let neighbor of neighbors) {
    if (!Memory.rooms[neighbor]) {
      Memory.rooms[neighbor] = {role:'wilderness', execute:false, _nextScan: 1};
    }

    let mem = Memory.rooms[neighbor];

    if (!(mem._nextScan < Game.time + 500)) {
      Observe.setNextScan(neighbor, 500);
    }
  }
}

let roomsToScan = {};

function observeNormal(room) {
  if (!DO_OLD_OBSERVERS || !room.observer || !room.observer.my || !room.observer.active) {
    return;
  }

  if (roomsToScan.timestamp != Game.time) {
    roomsToScan = {
      rooms: _(Memory.rooms).keys()
        .filter(k => !Game.rooms[k] && Game.time >= Memory.rooms[k]._nextScan)
        .map(function(k) {return {name: k, last: (Memory.rooms[k]._lastVisible || 0)};})
        .sortBy('last').value(),
      timestamp: Game.time
    };
  }
  
  // roomsToScan.rooms is sorted, stalest first. Scan the first room in that
  // list that's in range.
  for (let i=0; i < roomsToScan.rooms.length; i++) {
    if (!roomsToScan.rooms[i].scanning &&
      Game.map.getRoomLinearDistance(roomsToScan.rooms[i].name, room.name) <= OBSERVER_RANGE) {
      let result = room.observer.observeRoom(roomsToScan.rooms[i].name);
      if (result == OK) {
        //room.logError(`Scanning room ${roomsToScan.rooms[i].name}`);
        roomsToScan.rooms[i].scanning = true;
        Game.observerIntents = (Game.observerIntents || 0) + 1;
        return;
      } else {
        room.logError('Failed scan. This should never happen.');
      }
    }
  }
}

// A rampart over a critical structure becomes a trigger rampart when it gets up
// to this many hits.
const ENABLE_TRIGGER_RAMPART_HITS = 300000;

// A trigger rampart causes a safemode when it gets down to this many hits.
const PANIC_TRIGGER_RAMPART_HITS = 100000;

function updateTriggerRamparts(room) {
  if (!room.memory.triggerRamparts) {
    room.memory.triggerRamparts = [];
  }
  
  // Update the list of trigger ramparts. Trigger ramparts are the ones
  // that, if they go below 100k, we pop a safemode.

  // Any rampart on a spawn, storage, or terminal, which has 1M+ hits
  // should be a trigger rampart.
  
  // Note: Once a rampart goes on the triggerRamparts list, it must not
  // be removed by this process. This refresh could happen after an enemy
  // knocks it below 1M but before the enemy knocks it below 100k.
  let candidateRamparts = _(room.spawns)
    .union([room.terminal, room.storage])
    .compact()
    .map(function(s) {return s.pos.findInRange(room.ramparts, 0)[0];})
    .filter(r => r && r.hits > ENABLE_TRIGGER_RAMPART_HITS)
    .map('id')
    .value();
    
  let newTriggerRamparts = _.difference(candidateRamparts, room.memory.triggerRamparts);
  
  for (let i=0; i < newTriggerRamparts.length; i++) {
    room.logError('Adding trigger rampart at ' +
      Game.getObjectById(newTriggerRamparts[i]).pos);
  }
  
  room.memory.triggerRamparts = _.union(room.memory.triggerRamparts, candidateRamparts);
}
  


function updateSafemode(room) {
  if (room.memory.fakeSafeMode ||
      room.controller.safeModeCooldown ||
      !room.controller.safeModeAvailable) {
    return;
  }

  if (room.controller.level < 8) {
    let hostiles = _.filter(room.hostilePlayerCreeps, c => c.attackPower > 1600);
    if (hostiles.length) {
      let result = room.controller.activateSafeMode();
      if (result == OK) {
        let message = 'Enabling safemode in ' + room.name + ' because hair trigger (1).';
        room.logError(message);
        Game.notify(message);
      } else {
        room.logError('Failed to activate safemode: ' + result);
      }
    }
  }

  if (room.controller.level < 4 && !room.towers.length && room.hostileCreeps.length) {
    let result = room.controller.activateSafeMode();
    if (result == OK) {
      let message = 'Enabling safemode in ' + room.name + ' because hair trigger (2).';
      room.logError(message);
      Game.notify(message);
    } else {
      room.logError('Failed to activate safemode: ' + result);
    }
  }

  if (room.controller.level < 8 && room.threatLevel == Threat.THREAT_MAJOR) {
    // Wait, this can't be right? If the room is below 8, no safemode from trigger ramparts?
    // How does that make sense?
    //room.logError('considering safe mode for some reason');
    //return;
  }

  // See if any of the trigger ramparts are below 100k.
  let ramparts = _.compact(_.map(room.memory.triggerRamparts, Game.getObjectById));
  
  for (let i=0; i < ramparts.length; i++) {
    let rampart = ramparts[i];
    if (rampart.hits < PANIC_TRIGGER_RAMPART_HITS) {
      let protectedStructure = rampart.pos.findInRange(FIND_MY_STRUCTURES, 0, {
        filter: s => s.structureType != STRUCTURE_RAMPART
      })[0];

      if (!protectedStructure) {
        if (rampart.pos.getRangeTo(room.controller) == 1) {
          protectedStructure = room.controller;
        } else {
          protectedStructure = {structureType: 'nothing'};
        }
      }
      
      let result = room.controller.activateSafeMode();
      //let result = OK;
      //room.memory.fakeSafeMode = true;
      
      if (result == OK) {
        let message = 'Enabling safemode in ' + room.name + ' because ' +
          'rampart at ' + rampart.pos + ' protecting ' +
          protectedStructure.structureType + ' has gone low.';
        room.logError(message);
        Game.notify(message);
      } else {
        room.logError('Failed to activate safemode: ' + result);
      }
      return;
    }
  }
}

function trimUpgradePositions(room) {
  if (room.controller.level == 8 &&
    room.controller.my &&
    room.memory.upgrade &&
    room.memory.upgrade.pos.length > 1) {
    room.memory.upgrade.pos = _.slice(room.memory.upgrade.pos, 0, 1);
  }
}

function makeUpgradersRcl7(room) {
  if (!room.hashTime(10) ||
    !room.terminal ||
    !room.storage) {
    return;
  }
  
  let upgraderFlag = room.find(FIND_FLAGS, {
    filter: f => f.memory.role == 'spawner' &&
           f.memory.upgrader &&
           f.memory.execute != false
  })[0];
  
  if (upgraderFlag) {
    return;
  }

  let leadTime = 50;

  let myCreeps = _.filter(
    room.ownedCreeps,
    c => c.memory.role == 'upgrader' &&
      c.memory.workRoom == room.name &&
      (c.spawning || c.ticksToLive > leadTime));

  let workRemaining = room.controller.progressTotal - room.controller.progress;
  let workAvailable = _.sum(room.upgraders, c => c.ticksToLive * c.upgradePower);

  if (workAvailable > workRemaining) {
    return;
  }

  let permittedByEnergy = room.activeTerminal ?
    Math.floor(room.terminal.store.energy / 10000) :
    Math.floor((room.roughEnergy - 100000) / 100000);
  let permittedByController = room.upgradePositions.length;
  let numDesired = Math.min(permittedByEnergy, permittedByController);
  let model = 7;

  if (numDesired == 0) {
    numDesired = 1;
    model = 20;
  }

  if (room.controller.level == 7 &&
      room.baseType == 'lw' &&
      room.upgradePositions.length &&
      room.upgradePositions[0].findInRange(FIND_MY_SPAWNS,1).length) {
    numDesired = 1;
    model = 21;
  }
  
  room.logDebug(`Upgraders present = ${myCreeps.length}, desired=${numDesired} model-${model}`);

  if (myCreeps.length < numDesired) {
    if (Upgrader.requestSpawn(room, model, room, SpawnJob.PRIORITY_LOW) != OK) {
      room.logError('Failed to order Upgrader.');
    }
  }
}

function makeUpgradersRcl8(room) {
  if (!room.hashTime(10) || room.memory.shutdown) {
    return;
  }
  
  if (room.controller.ticksToDowngrade < room.controller.maxTicksToDowngrade / 3) {
    room.logError("downgrade warning!");
  }

  let leadTime = 75;
  
  let myCreeps = _.filter(
    room.ownedCreeps,
    c => c.memory.role == 'upgrader' &&
      c.memory.workRoom == room.name &&
      (c.spawning || c.ticksToLive > leadTime));

  let numDesired = 1;
  let model = 8;
  
  if (room.baseType != 'lw' && room.roughEnergy < FULL_TIME_UPGRADERS_ENERGY) {
    model = 20;
    if (room.controller.ticksToDowngrade > 150000) {
      numDesired = 0;
    }
  }

  if (room.baseType == 'lw') {
    if (room.roughEnergy < 50000) {
      model = 20;
      if (room.controller.ticksToDowngrade > 150000) {
        numDesired = 0;
      }
    } else {
      let nearestSpawn = room.controller.pos.findClosestByRange(room.spawns);
      if (nearestSpawn && nearestSpawn.pos.isNearTo(room.upgradePositions[0])) {
        model = 22;
      }
    }
  }

  if (myCreeps.length < numDesired) {
    if (Upgrader.requestSpawn(room, model, room, SpawnJob.PRIORITY_LOW) != OK) {
      room.logError('Failed to order Upgrader.');
    }
  }
}

function makeUpgradersStorage(room) {
  if (!room.hashTime(10) || room.memory.shutdown || !room.upgradePositions.length) {
    return;
  }

  if (room.baseType == 'lw' &&
      room.controller.ticksToDowngrade > 80000 &&
      room.roughEnergy < 100000) {
    return;
  }

  let upgraderFlag = room.find(FIND_FLAGS, {
    filter: f => f.memory.role == 'spawner' &&
           f.memory.upgrader &&
           f.memory.execute != false
  })[0];
  
  if (upgraderFlag) {
    return;
  }

  let settlerFlag = room.find(FIND_FLAGS, {
    filter: f => f.memory.role == 'spawner' &&
           f.memory.settler &&
           f.memory.execute != false
  })[0];
  
  if (settlerFlag) {
    return;
  }

  if ((!room.upgradeContainer && !room.upgradeLink) &&
    (!room.activeTerminal || !room.activeTerminal.servingController) &&
    (!room.activeStorage || !room.activeStorage.servingController)) {
      return;
  }

  let maxModel = Upgrader.currentModel(room.energyCapacityAvailable);
  let workParts = _.filter(Upgrader.getBody(maxModel), b => b == WORK).length;
  const BASE_ENERGY = 100000;
  const EXPECTED_SERVICE_LIFE = 1400;
  let energyPerUpgrader = EXPECTED_SERVICE_LIFE * workParts;
  let permittedByEnergy = room.activeTerminal ?
    Math.floor(room.terminal.store.energy / 5000) :
    Math.max(0, _.floor((room.roughEnergy - BASE_ENERGY) / (energyPerUpgrader)));
  
  let permittedByRoom = room.upgradePositions.length;

  if (room.baseType == 'lw') {
    permittedByRoom = Math.min(permittedByRoom, 1);
  }
  
  let numPermitted = Math.min(permittedByRoom, permittedByEnergy);
  
  let numDesired = room.controller.ticksToDowngrade < 10000 ? 1 : 0;
  let model = 20;
  const HASH_AND_TRAVEL_ALLOWANCE = 20;
  let leadTime = HASH_AND_TRAVEL_ALLOWANCE +
    Upgrader.getBody(maxModel).length * CREEP_SPAWN_TIME;

  if (numPermitted > 0) {
    numDesired = numPermitted;
    model = maxModel;
  }

  let numUpgraders = _.filter(
    room.ownedCreeps,
    c => c.memory.role == 'upgrader' &&
      c.memory.workRoom == room.name &&
      (c.spawning || c.ticksToLive > leadTime)).length;

  room.logDebug(`Upgraders present = ${numUpgraders}, desired=${numDesired} model-${model}`);
  room.logDebug(`permittedByRoom=${permittedByRoom} permittedByEnergy=${permittedByEnergy}`);

  if (numUpgraders < numDesired) {
    if (Upgrader.requestSpawn(room, model, room, SpawnJob.PRIORITY_LOW) != OK) {
      room.logError('Failed to order Upgrader.');
    }
  }
}

function makeUpgraders(room) {
  // Upgraders can be flagged. At RCL7+, backstop the flag with automatics.
  if (room.controller.level == 8) {
    makeUpgradersRcl8(room);
  } else if (room.controller.level == 7) {
    makeUpgradersRcl7(room);
  } else if (room.storage) {
    makeUpgradersStorage(room);
  }
}

let BUILDER_PERIOD = 6000;

function makeBuildersLowRcl(room) {
  if (room.controller.level == 8 || room.baseType == 'lw') return;

  if (!room.labs.length || !room.activeTerminal) {
    return;
  }

  if (!room.storage || room.storage.store.energy < 100000) {
    return;
  }

  let myCreeps = _.filter(room.ownedCreeps,c => c.memory.role == 'builder');

  let numDesired = Math.floor(room.roughEnergy / 250000);

  if (myCreeps.length >= numDesired) {
    return;
  }

  let model = Builder.currentModel(room.energyCapacityAvailable);
  let reason = 'initial buildout';

  let result =
    Builder.requestSpawn([room.name], model, room.name, SpawnJob.PRIORITY_DEFAULT, reason);
  if (result != OK) {
    room.logError('Failed to spawn builder.');
  }
}

function makeBuildersLw(room) {
  if (room.baseType != 'lw') return;

  if (room.constructionSites.length == 0 && Game.time < room.getLast('builder') + 5000) {
    return;
  }

  let myBuilders = _.filter(room.ownedCreeps,c => c.memory.role == 'builder');
    
  if (myBuilders.length) {
    // Builder is present or spawning. Note the sighting time.
    room.setLast('builder', Game.time);
    return;
  }

  let weakestRampart = _.min(room.ramparts, 'hits');
  if (room.constructionSites.length == 0 && weakestRampart && weakestRampart.hits > 10000000) {
    return;
  }

  let model = 11;
  let reason = 'lw';

  let result =
    Builder.requestSpawn([room.name], model, room.name, SpawnJob.PRIORITY_DEFAULT, reason);
  if (result != OK) {
    room.logError('Failed to spawn builder.');
  }
}

function makeBuilders(room) {
  if (room.baseType == 'lw') return;

  if (room.controller.level < 8) {
    return makeBuildersLowRcl(room);
  }

  if (room.memory.shutdown) {
    return;
  }

  let weakestScaledRampartHits = room.weakestScaledRampart().scaledHits;

  let needsAnyWallWork = weakestScaledRampartHits < 300 * 1000 * 1000;
  let urgentlyNeedsWallWork = weakestScaledRampartHits < 100 * 1000 * 1000;
  let numConstructionSites = room.constructionSites.length;

  if (!needsAnyWallWork && !numConstructionSites) {
    return;
  }

  let myBuilders = _.filter(room.ownedCreeps,c => c.memory.role == 'builder');
    
  if (myBuilders.length) {
    // Builder is present or spawning. Note the sighting time.
    room.setLast('builder', Game.time);
  }

  let numDesired = 0;
  let model = room.memory.builderModel || 25;
  let reason = '';

  let maintenanceBuilderTime = Math.max(
      _.get(room.memory, '_last.builder') + BUILDER_PERIOD,
      room.memory._nextMaintenanceTime);

  if (room.nukes.length && (room.roughEnergy > NUKER_BUILDER_ENERGY)) {
    reason = 'nukes';
    numDesired = 3;
  } else if (room.roughEnergy > TWO_BUILDERS_ENERGY) {
    reason = 'two builders';
    numDesired = 2;
  } else if (room.roughEnergy > ONE_BUILDERS_ENERGY) {
    reason = 'one builder'
    numDesired = 1;
  } else if (Game.time > maintenanceBuilderTime) {
    reason = 'maintenance';
    numDesired = 1;
  } else if (urgentlyNeedsWallWork && room.roughEnergy > URGENT_WALLS_ENERGY) {
    reason = 'urgent';
    numDesired = 1;
  } else if (numConstructionSites) {
    reason = 'construction';
    model = Builder.currentModel(room.energyCapacityAvailable);
    numDesired = 1;
  } else if (room.alertCondition == ALERT_CONDITION_RED) {
    reason = 'red_alert';
    numDesired = 1;
  }
  
  if (myBuilders.length >= numDesired) {
    return;
  }

  // Make another.
  let result =
    Builder.requestSpawn([room.name], model, room.name, SpawnJob.PRIORITY_DEFAULT, reason);
  if (result != OK) {
    room.logError('Failed to spawn builder.');
  }
}

function shuntEnergyLw(room) {
  if (room.baseType != 'lw') return;

  if (!room.terminal || room.terminal.cooldown || room.terminal.busy) return;

  if (room.terminal.store.energy < 150000) return;

  let dump = room.nearestNonLwTerminalBase;
  
  if (!dump || !dump.activeTerminal || dump.availableTerminalSpace < 50000) return;

  room.logDebug(`Lw base shipping 50000 excess energy to ${dump.name}.`);
  room.terminal.mySend(RESOURCE_ENERGY, 50000, dump.name, 'shuntEnergy');
}

function shuntEnergy(room) {
  if (room.baseType == 'lw') return;

  const MIN_AMOUNT_TO_SEND = 5000;
  if (room.availableStorageSpace < 50000 &&
      room.terminal &&
      !room.terminal.cooldown &&
      !room.terminal.busy &&
      room.controller.level == 8 &&
      room.storage &&
      room.terminal.store.energy > MIN_AMOUNT_TO_SEND) {
    // Find the base with the least energy which can receive.
    let eligibleTargets = _.filter(
      Game.terminalBases,
      b => !b.memory.shutdown && b.availableTerminalSpace >= 5000);
    let least = _.max(eligibleTargets, 'availableStorageSpace');
    if (least.availableStorageSpace < 50000) {
      // Too full.
      return;
    }

    let terminalSpace = least.terminal.storeCapacity -
      (_.sum(least.terminal.store) + _.sum(least.terminal.incoming));
    let cost1k = Game.market.calcTransactionCost(1000, room.name, least.name);
    let amountWeCanSend = Math.floor(room.terminal.store.energy * 1000 / (1000 + cost1k));
    let amountToSend = Math.min(terminalSpace, amountWeCanSend);
    //room.logError(`${room.roughEnergy} send to ${least.name} ${least.roughEnergy} space = ${terminalSpace}`);
    //room.logError(`weHave=${room.terminal.store.energy}`);
    //room.logError(`cost1k=${cost1k}`);
    //room.logError(`amountWeCanSend=${amountWeCanSend}`);
    //room.logError(`amountToSend=${amountToSend}`);
    room.logError(`Shedding ${amountToSend} energy to ${least.name}.`);
    room.terminal.mySend(RESOURCE_ENERGY, amountToSend, least.name, 'shuntEnergy');
  }
}

Room.prototype.maybeQueueJunk = function() {
  return maybeQueueJunk(this);
}

function maybeQueueJunk(room) {
  // Keep some G on hand.
  let ghodiumOnHand = room.roughInventory(RESOURCE_GHODIUM);
  if (ghodiumOnHand < 3000) {
    //let amountToMake = Math.floor((3000 - ghodiumOnHand) / 5 ) * 5;
    let amountToMake = 3000;
    room.logError(`(maybeQueueJunk) queueing ${amountToMake} G`);
    room.addLabOrder(RESOURCE_GHODIUM, amountToMake);
    return;
  }

  // If any vaults exist, do this only at vaults. Everyone else ships this junk to vaults.
  if (room.nearestVault && !room.isVault) return;

  if (room.memory.labs && room.memory.labs.orders && room.memory.labs.orders.length) {
    room.logError(`maybeQueueJunk shouldn't be called with orders in the queue.`);
    return;
  }

  // Break down GHO2
  let gho2OnHand = room.roughInventory('GHO2');
  if (gho2OnHand >= 100) {
    let amount = Math.min(3000, _.floor(gho2OnHand / 5) * 5);
    room.logError(`(maybeQueueJunk) queueing reverse ${amount} GHO2`);
    room.addReverseLabOrder('GHO2', amount);
    return;
  }

  // Break down UH2O
  let uh2OOnHand = room.roughInventory('UH2O');
  if (uh2OOnHand >= 100) {
    let amount = Math.min(3000, _.floor(uh2OOnHand / 5) * 5);
    room.logError(`(maybeQueueJunk) queueing reverse ${amount} UH2O`);
    room.addReverseLabOrder('UH2O', amount);
    return;
  }

  // Break down ZH2O
  let zh2OOnHand = room.roughInventory('ZH2O');
  if (zh2OOnHand >= 100) {
    let amount = Math.min(3000, _.floor(zh2OOnHand / 5) * 5);
    room.logError(`(maybeQueueJunk) queueing reverse ${amount} ZH2O`);
    room.addReverseLabOrder('ZH2O', amount);
    return;
  }

  // Break down any two-letter compound except GH & OH.
  let twoLetterMineral = _(RECIPES)
      .keys()
      .filter(k => k.length == 2 && k != 'GH' && k != 'OH')
      .find(k => room.terminal.store[k] > 99);
  if (twoLetterMineral) {
    let onHand = room.terminal.store[twoLetterMineral];
    let amount = Math.min(3000, _.floor(onHand / 5) * 5);
    room.logError(`(maybeQueueJunk) queueing reverse ${amount} ${twoLetterMineral}`);
    room.addReverseLabOrder(twoLetterMineral, amount);
    return;
  }

  // React GH2O
  let ghodiumAcidOnHand = room.roughInventory(RESOURCE_GHODIUM_ACID);
  if (ghodiumAcidOnHand >= 100) {
    let amount = Math.min(3000, _.floor(ghodiumAcidOnHand / 5) * 5);
    room.logError(`(maybeQueueJunk) queueing ${amount} XGH2O`);
    room.addLabOrder('XGH2O', amount);
    return;
  }

  // Maybe dump XGHO2
  let toughOnHand = room.roughInventory('XGHO2');
  if (toughOnHand >= 100 &&
      room.nearestVault &&
      room.nearestVault.storage &&
      room.nearestVault.storage.store.XGHO2 > room.nearestVault.storage.store.XUH2O &&
      room.nearestVault.storage.store.XGHO2 > 600000) {
    let amount = Math.min(3000, _.floor(toughOnHand / 5) * 5);
    room.logError(`(maybeQueueJunk) queueing reverse ${amount} XGHO2`);
    room.addReverseLabOrder('XGHO2', amount);
    return;
  }

  // Maybe dump XUH2O
  let attackOnHand = room.roughInventory('XUH2O');
  if (attackOnHand >= 100 &&
      room.nearestVault &&
      room.nearestVault.storage &&
      room.nearestVault.storage.store.XUH2O > room.nearestVault.storage.store.XGHO2 &&
      room.nearestVault.storage.store.XUH2O > 600000) {
    let amount = Math.min(3000, _.floor(attackOnHand / 5) * 5);
    room.logError(`(maybeQueueJunk) queueing reverse ${amount} XUH2O`);
    room.addReverseLabOrder('XUH2O', amount);
    return;
  }
}

function maybeMakeHarvestBoost(room) {
  if (!room.name.isSectorEdge()) return;
  if (room.memory.labs.orders.length) return;
  if (room.roughInventory('XUHO2') >= 6000) return;

  room.logError(`(updateLaborders-maybeMakeHarvestBoost) Queueing 3000 XUHO2.`);
  room.addLabOrder('XUHO2', 3000);
}

function updateLabOrders(room) {
  if (room.controller.level < 7) {
    return;
  }
  
  if (room.memory.shutdown || room.memory.shutdownLabs) {
    return;
  }
  
  if (room.labs.length < 3) {
    return;
  }

  let labOrders = (room.memory.labs && room.memory.labs.orders) || [];

  let numReactors = Math.max(room.labs.length - 2);
  let timeToFinish = Math.ceil(orderTime(labOrders) / numReactors);
  
  if (timeToFinish > 1000) {
    return;
  }

  if (!labOrders.length) {
    maybeQueueJunk(room);
    labOrders = (room.memory.labs && room.memory.labs.orders) || [];
    if (labOrders.length) return;
  }

  let boostToMake = Labs.mostUrgentlyNeededBoost();
  if (!boostToMake) {
    maybeMakeHarvestBoost(room);
    return;
  }

  // Bail if we're working on a reverse order. If we're working one of these, odds are
  // good we should work another before queueing any forward stuff. Eat the delay if that's
  // not so.
  if (room.memory.labs.orders.length && room.memory.labs.orders[0].reverse) return;

  room.logError(`(updateLaborders) Queueing 3000 ${boostToMake}.`);
  room.addLabOrder(boostToMake, 3000);
}

const MAX_BUY_ORDERS_PER_BASE = 2;

const PRICE_HIKE_INTERVAL = 400;

const MINERAL_BUY_PROPERTIES = {
  H: {maxPrice: 16.0},
  O: {maxPrice: 48.0},
  U: {maxPrice: 16.0},
  L: {maxPrice: 32.0},
  Z: {maxPrice: 16.0},
  K: {maxPrice: 16.0},
  X: {maxPrice: 32.0},
  energy: {maxPrice: 8.0},
};

function newMineralBuyOrderPrice(resourceType) {
  // Price of a new buy order is the lower of:
  // - The lowest price of any of my current open orders for that resource.
  // - 10% below the highest-priced active buy order (of any other player) for that resource.
  
  let myBuyOrders = _.filter(
    Game.market.orders,
    o => o.type == ORDER_BUY && o.resourceType == resourceType && o.active);
  
  let myLowOrder = _.min(myBuyOrders, 'price');
  let myLowPrice = (myLowOrder && myLowOrder.price) || Infinity;
  
  if (!Game.orders || !Game.orders.all) {
    Market.setOrders();
  }
  
  let marketBuyOrders = _.filter(
    Game.orders.all,
    o => o.type == ORDER_BUY &&
       o.resourceType == resourceType &&
       o.amount &&
       !Game.market.orders[o.id]);
       
  let marketHighOrder = _.max(marketBuyOrders, 'price');
  let marketHighPrice = (marketHighOrder && marketHighOrder.price) || 0.002;
  
  return _.round(Math.min(myLowPrice, marketHighPrice * 0.9), 3);
}

// When auto buying, cap amount at this much.
const LARGEST_ORDER_SIZE = 50000;

function updateBuyOrders(room) {
  if (room.controller.level < 7 ||
    !room.terminal ||
    room.terminal.servingController ||
    !room.storage ||
    room.memory.preShutdown ||
    room.memory.shutdown ||
    room.memory.shutdownLabs ||
    room.baseType == 'lw') {
    return;
  }
  
  let myBuyOrders = _.filter(
    room.orders,
    o => o.type == ORDER_BUY &&
        room.buyAmounts[o.resourceType]);
  
  // Cancel my filled orders.
  _(myBuyOrders)
    .filter(o => !o.amount)
    .map('id')
    .forEach(function(o) {Game.market.cancelOrder(o); delete Memory.market.lastPriceHike[o]})
    .value();

  // Cancel my hopeless orders.
  if (MINERAL_BUY_PROPERTIES.energy.maxPrice + 1 < recentEnergyPrice()) {
    _(myBuyOrders)
      .filter(o => o.resourceType == RESOURCE_ENERGY && o.price <= MINERAL_BUY_PROPERTIES.energy.maxPrice)
      .map('id')
      .forEach(function(o) {Game.market.cancelOrder(o); delete Memory.market.lastPriceHike[o]})
      .value();
  }
      
  // Find my open orders.
  let myOpenBuyOrders = _.filter(myBuyOrders, o => o.active && o.amount);
    
  if (!Memory.market) {
    Memory.market = {};
  }
  
  if (!Memory.market.lastPriceHike) {
    Memory.market.lastPriceHike = {};
  }

  // Maybe raise prices.
  for (let i = 0; i < myOpenBuyOrders.length; i++) {
    let order = myOpenBuyOrders[i];
    if (!Memory.market.lastPriceHike[order.id]) {
      Memory.market.lastPriceHike[order.id] = Game.time;
    }
    
    let lastPriceHike = Memory.market.lastPriceHike[order.id];
    
    let lastSaleAtThisPriceOrBetter =
      Memory.market.purchasePrices[order.id] &&
      Memory.market.purchasePrices[order.id].price <= order.price &&
      Memory.market.purchasePrices[order.id].time;
    
    let lastHikeOrSale = Math.max(lastPriceHike || 0, lastSaleAtThisPriceOrBetter || 0);
    
    if (lastHikeOrSale + PRICE_HIKE_INTERVAL < Game.time) {
      // price adjustment is 1% of current price, rounded up to the nearest 0.005
      let price_increment = _.ceil(order.price * 2) / 200;
      let newPrice = Math.floor((order.price + price_increment) * 1000) / 1000;
      
      if (newPrice <= MINERAL_BUY_PROPERTIES[order.resourceType].maxPrice) {
        room.logDebug('Raising the price on order ' + order.id + ' by ' + price_increment + ' to ' + newPrice);
        Game.market.changeOrderPrice(order.id, newPrice);
        Memory.market.lastPriceHike[order.id] = Game.time;
      }
    }
  }
  
  // Figure out what I need.
  let mineralsNeeded = {};
  let mineralsNeededSansOrders = {};
  
  for (let key in room.buyAmounts) {
    let amountOnHand = key == RESOURCE_ENERGY ? room.roughEnergy : room.roughInventory(key);

    let buyOrders = _.filter(myOpenBuyOrders, o => o.resourceType == key);            
    let amountOnOrder = _.sum(buyOrders, 'amount');
    let lack = Math.max(0, room.buyAmounts[key] - (amountOnHand + amountOnOrder));
    
    mineralsNeededSansOrders[key] = Math.max(0, room.buyAmounts[key] - amountOnHand);
    mineralsNeeded[key] = Math.max(0, Math.min(lack, LARGEST_ORDER_SIZE - amountOnOrder));
  }

  function shippingCostPerUnit(roomName) {
    return 0.001 * recentEnergyPrice() * Game.market.calcTransactionCost(1000, room.name, roomName);
  }

  if (!Game.orders || !Game.orders.all) {
    Market.setOrders();
  }

  // Maybe buy minerals from sell orders.
  let needsMinusEnergy = _.cloneDeep(mineralsNeededSansOrders);
  delete needsMinusEnergy.energy;
  let greatestNeed = greatestKey(needsMinusEnergy);
  if (needsMinusEnergy[greatestNeed] > 0) {
    let maxPrice = MINERAL_BUY_PROPERTIES[greatestNeed].maxPrice;
    //room.logError(`I need ${needsMinusEnergy[greatestNeed]} ${greatestNeed} for which I'd pay as much as ${maxPrice}`);
    try {
      let sellOrders = _.filter(
        Game.orders.all,
        o => o.type == ORDER_SELL &&
            o.roomName &&
            o.amount > 0 &&
            o.resourceType == greatestNeed);
      if (sellOrders.length) {
        let bestOrder = _.min(sellOrders, o => o.price + shippingCostPerUnit(o.roomName));
        let orderId = bestOrder.id;
        let amount = Math.min(bestOrder.amount, needsMinusEnergy[greatestNeed]);
        let netPrice = bestOrder.price + shippingCostPerUnit(bestOrder.roomName);
        if (netPrice <= maxPrice) {
          //room.logError(`Buying: Game.market.deal(${orderId}, ${amount}, ${room.name}) (unit cost=${_.round(netPrice, 3)})`);
          let result = Game.market.deal(orderId, amount, room.name);
          if (result == OK) {
            room.terminal.busy = true;
          }
        } else {
          //room.logError(`Best available price was ${_.round(netPrice, 3)}`);
        }
      }
    } catch (err) {
        room.logError(`buying stuff error: ${err} (${stage}) ${JSON.stringify(foo)}`);
    }
  }

  // Maybe buy energy from sell orders.
  if (!room.terminal.busy) {
    let energyNeed = mineralsNeededSansOrders.energy;
    let maxPrice = Market.HIGH_ENERGY_PRICE;
    if (energyNeed) {
      //room.logError(`I need ${energyNeed} energy and have ${room.roughEnergy}`);
      let sellOrders = _.filter(
        Game.orders.all,
        o => o.type == ORDER_SELL &&
            o.roomName &&
            o.amount > 0 &&
            o.resourceType == RESOURCE_ENERGY);
      if (sellOrders.length) {
        let bestOrder = _.min(sellOrders, o => o.price + shippingCostPerUnit(o.roomName));
        let orderId = bestOrder.id;
        let amount = Math.min(bestOrder.amount, mineralsNeededSansOrders.energy);
        let netPrice = bestOrder.price + shippingCostPerUnit(bestOrder.roomName);
        if (netPrice <= maxPrice) {
          //room.logError(`Buying ${amount} energy at ${_.round(netPrice, 3)} per`);
          let result = Game.market.deal(orderId, amount, room.name);
          if (result == OK) {
            room.terminal.busy = true;
          }
        } else {
          //room.logError(`Best available price was ${_.round(netPrice, 3)} at distance ${Game.map.getRoomLinearDistance(room.name, bestOrder.roomName)}`);
        }
      }
    }
  }

  // Maybe enlarge existing orders.
  for (let i = 0; i < myOpenBuyOrders.length; i++) {
    let order = myOpenBuyOrders[i];
    
    if (mineralsNeeded[order.resourceType]) {
      let amountToAdd = mineralsNeeded[order.resourceType];
      
      // sanity check the amount to add.
      if (amountToAdd < 0 || amountToAdd > room.buyAmounts[order.resourceType]) {
        room.logError(`===> Sanity check failure. I computed amountToAdd=${amountToAdd}.`);
        continue;
      }

      //room.logError(`Extending order ${order.id} by ${amountToAdd} units. Est cost = ${Math.ceil(order.price * amountToAdd)}.`);
      let result = Game.market.extendOrder(order.id, amountToAdd);
      if (result == OK) {
        delete mineralsNeeded[order.resourceType];
      } else {
        room.logError('Failed with result ' + result);
      }
    }
  }
  
  // Maybe post new orders.
  if (myOpenBuyOrders.length >= MAX_BUY_ORDERS_PER_BASE) {
    return;
  }

  // Don't bother trying to buy energy if the price is hopeless.
  if (recentEnergyPrice() > MINERAL_BUY_PROPERTIES.energy.maxPrice) {
    delete mineralsNeeded[RESOURCE_ENERGY];
  }

  if (!_.keys(mineralsNeeded).length) {
    return;
  }

  let mostUrgent = _.max(_.pairs(mineralsNeeded), function(p) {return p[1];})

  if (!mostUrgent || mostUrgent[1] < 1000) {
    return;
  }

  //room.logError(`Most urgent need is ${mostUrgent[0]} of which I lack ${mostUrgent[1]}.`);
  let resourceType = mostUrgent[0];
  
  let amount = mostUrgent[1];
  let bidPrice = newMineralBuyOrderPrice(resourceType);

  // Sanity checks
  if (bidPrice < 0 || bidPrice > MINERAL_BUY_PROPERTIES[resourceType].maxPrice) {
    room.logError(`===> Sanity check failure. I computed ${resourceType} bidPrice=${bidPrice}.`);
    return;
  }

  if (amount < 0 || amount > room.buyAmounts[resourceType]) {
    room.logError(`===> Sanity check failure. I computed ${resourceType} amount=${amount}.`);
    return;
  }

  if (resourceType == RESOURCE_ENERGY && Game.market.credits < 70000000) {
    room.logError(`===> Shutting off energy buy orders because insufficient cash.`);
    return;
  }

  Game.market.createOrder(ORDER_BUY, resourceType, bidPrice, amount, room.name);
  room.logDebug(`Game.market.createOrder(${ORDER_BUY}, ${resourceType}, ${bidPrice}, ${amount}, ${room.name});`);
}

function emptyTerminal(room) {
  if (!room.memory.shutdown ||
    !room.terminal ||
    room.terminal.busy ||
    room.terminal.cooldown) {
    return;
  }
  
  if (room.hashTime(100)) {
    room.logError('emptying!');
  }
  
  let max = _(room.terminal.store)
      .pairs()
      .filter(p => p[0] != RESOURCE_ENERGY && p[0] != RESOURCE_POWER)
      .max(p => p[1]);
  if (max == -Infinity) return;

  let maxResource = max[0];
  let maxAmount = Math.min(room.terminal.store.energy, max[1]);
  
  let eligibleReceivers = _.filter(
    Game.terminalBases,
    b => b != room && b.controller.level == 8 && !b.terminal.servingController);
  
  let baseWithLeast = _.min(
    eligibleReceivers,
    b => b.roughInventory(maxResource));

  if (baseWithLeast.terminal.incoming) {
    return;
  }
  
  room.terminal.mySend(maxResource, maxAmount, baseWithLeast.name, 'emptyTerminal');
}

function dumpExcessLw(room) {
  if (room.baseType != 'lw') return;

  let dump = room.nearestNonLwTerminalBase;

  if (!dump || dump.terminal.store.getUsedCapacity() > TERMINAL_CAPACITY * 9 / 10) return;

  if (!room.terminal) return;

  let costToSendOneK = Game.market.calcTransactionCost(1000, room.name, dump.name);
  let maxToSend = Math.floor(room.terminal.store.energy / costToSendOneK) * 1000;

  if (maxToSend < 1000) {
    return;
  }

  for (let key in room.terminal.store) {
    if (key == RESOURCE_ENERGY) continue;
    
    let amountToSend = Math.min(maxToSend, room.terminal.store[key]);
    let result = room.terminal.mySend(key, amountToSend, dump.name, 'dumpExcessLw');
    if (result == OK) {
      return;
    }
  }
}

function dumpExcess(room) {
  if (!room.activeTerminal ||
      room.terminal.busy ||
      room.terminal.cooldown ||
      Game.cpu.bucket < 1000 ||
      ticksSinceReset() < 10) {
    return;
  }

  if (room.isVault || !room.nearestVault) {
    return;
  }

  if (room.nearestVault.terminal.store.getUsedCapacity() > TERMINAL_CAPACITY * 9 / 10) {
    return;
  }

  let costToSendOneK = Game.market.calcTransactionCost(1000, room.name, room.nearestVault.name);
  let maxToSend = Math.floor(room.terminal.store.energy / costToSendOneK) * 1000;

  if (maxToSend < 1000) {
    return;
  }

  // Don't need this anymore. Shifter and resource limits handle it.
  /*if (room.terminal.servingController) {
    let key = _(room.terminal.store)
      .pairs()
      .filter(p => ![RESOURCE_ENERGY, 'XGH2O', 'XLH2O'].includes(p[0]))
      .max(p => p[1])[0];
    let terminalAmount = room.terminal.store[key];
    let amountToSend = Math.min(maxToSend, terminalAmount);
    if (amountToSend >= 1000) {
      room.terminal.mySend(key, amountToSend, room.nearestVault.name, 'dumpExcess(1)');
    }
    return;
  }*/

  function logSend(resource, amount) {
    //room.logError(`dumpExcess: ${amount} ${resource}`);
  }

  function getMinToSend(resource) {
    if (COMMODITIES[resource] && COMMODITIES[resource].level) {
      return 10;
    } else {
      if (room.resourceLimits[resource] == 0) return 0;
      return 1000;
    }
  }

  // Send any excess to vault.
  for (let key in room.terminal.store) {
        let desiredRoomAmount = room.resourceLimits[key];

    if (room.roughInventory(key) > desiredRoomAmount) {
      let roomExcess = room.roughInventory(key) - desiredRoomAmount;
      let terminalAmount = room.terminal.store[key];
      let amountToSend = Math.min(maxToSend, roomExcess, terminalAmount);
      let minToSend = getMinToSend(key);
      if (amountToSend >= minToSend) {
        let result = room.terminal.mySend(key, amountToSend, room.nearestVault.name, 'dumpExcess(2)');
        if (result == OK) {
          logSend(key, amountToSend);
        }
        return;
      }
    }
  }

  // Send to vault if vault's reserve is small
  let vault = room.nearestVault;
  let nativeMineral = room.nativeMineral;
  let localMineralOnHand = room.roughInventory(nativeMineral);
  let vaultReserveAmount = ['O', 'H'].includes(nativeMineral) ? 24000 : 12000;
  if (vault &&
      localMineralOnHand > vaultReserveAmount &&
      vault.roughInventory(nativeMineral) < 2 * vaultReserveAmount) {
    let roomExcess = localMineralOnHand - vaultReserveAmount;
    let vaultNeed = vault.roughInventory(nativeMineral) - 2 * vaultReserveAmount;
    let terminalAmount = room.terminal.store[nativeMineral];
    let amountToSend = Math.min(roomExcess+1000, vaultNeed, terminalAmount);
    if (amountToSend > 0) {
      let result = room.terminal.mySend(nativeMineral, amountToSend, vault.name, 'dumpExcess(3)');
      if (result == OK) {
        //room.logDebug(`(dumpExcess) sent ${amountToSend} ${nativeMineral} to vault. (reserve)`);
        //logSend(nativeMineral, amountToSend);
      }
    }
  }
}

function checkRoomLevel(room) {
  if (room.memory.oldLevel == undefined) {
    room.memory.oldLevel = room.controller.level;
  }
  
  if (room.memory.oldLevel != room.controller.level) {
    room.memory._lastLevelChange = Game.time;
    room.memory.oldLevel = room.controller.level;
    
    if (room.controller.level == 8) {
      let upgraderFlag = room.find(
        FIND_FLAGS,
        {filter: f => f.memory.role == 'spawner' && f.memory.upgrader})[0];
        
      if (upgraderFlag) {
        delete upgraderFlag.memory.upgrader;
      }
    }

    if (room.controller.level == 6 && room.baseType == 'lw' && room.basecouriers.length) {
      // kill basecouriers.
      room.logError(`LW base reaches RCL6. Killing basecouriers.`)
      _(room.basecouriers).forEach(c => c.memory.state = STATE_DIE);
    }

    if (room.controller.level == 6 && room.baseType == 'lw') {
      let settlerFlag = room.find(FIND_FLAGS, {
        filter: f => f.memory.role == 'spawner' &&
               f.memory.settler &&
               f.memory.execute != false
      })[0];

      if (settlerFlag) {
        room.logError('Disabling settler flag in LW base that just reached RCL6.');
        settlerFlag.memory.execute = false;
      }
    }
  }
}

function checkBalance(room) {
  if (!room.activeTerminal) {
    return;
  }

  if (room.controller.level < 8) {
    return;
  }

  let maxDist = room.memory.maxBalanceDistance || MAX_ENERGY_BALANCE_DISTANCE;
  let terminalRooms = _.filter(
    Game.terminalBases,
    b => Game.map.getRoomLinearDistance(room.name, b.name) <= maxDist);

  if (terminalRooms.length > 8 && maxDist > MAX_ENERGY_BALANCE_DISTANCE) {
    room.logError(`I have ${terminalRooms.length} rooms in balance range and could probably do with fewer.`);
  }

  if (terminalRooms.length < 2 && Game.terminalBases.length > 2) {
    room.logError(`I have ${terminalRooms.length} rooms in balance range and probably need more.`);
  }
}

function checkServingController(room) {
  if (room.controller.level < 8 &&
    room.terminal &&
    room.terminal.servingController &&
    !room.memory.serveController) {
    room.logError(`Initializing serveController operation`);
    room.memory.serveController = {};
  }
}

function checkLabExecute(room) {
  if (room.controller.level == 8 &&
    room.baseType != 'lw' &&
    room.terminal &&
    !room.terminal.servingController &&
    room.memory.labs &&
    !room.memory.labs.execute &&
    !room.memory.shutdown &&
    !room.memory.preShutdown) {
    room.logError(`Room labs execute is unset.`);
  }
}

function maybeClearBasecourierIdlePos(room) {
  // mature bunkers don't need basecourierIdlePos
  if (room.baseType == 'bunker' &&
      room.storage &&
      room.terminal &&
      !room.terminal.servingController &&
      room.memory.basecourierIdlePos) {
    room.logError(`I have unnecessary basecourierIdlePos`);
  }
}

function maybeClearBunkerCenter(room) {
  // rooms with storages don't need bunkerCenter
  if (room.memory.bunkerCenter &&
      room.storage &&
      room.storage.my) {
      room.logError(`I have unnecessary bunkerCenter`);
    delete room.memory.bunkerCenter;
  }
}

function checkBasecourierModel(room) {
  // RCL-7+ rooms should have model-15 basecouriers.
  if (room.controller.level > 6) {
    let obsoleteBasecouriers = _.filter(
      room.myCreeps,
      c => c.memory.role == 'basecourier' &&
        c.memory.model != 15);
    if (obsoleteBasecouriers.length) {
      room.logError(`I have obsolete basecouriers.`);
    }
  }
}

function checkDumbContainers(room) {
  if (room.upgradeLink &&
      room.upgradeContainer &&
      !room.upgradeContainer.isSourceContainer) {
    room.logError('I have an unneeded upgradeContainer. The link is all I need.');
  }
}

function checkLwContainerJunk(room) {
  if (room.baseType == 'lw' &&
      room.mineralContainer &&
      room.storageCrane &&
      room.mineralContainer.store.getUsedCapacity() >
          room.mineralContainer.store[RESOURCE_ENERGY] +
          room.mineralContainer.store[room.nativeMineral]) {
    room.logError(`Foreign junk in my mineralContainer. Asking the crane to fix it.`);
    Crane.requestClearMineralContainer(room.storageCrane);
  }
}

function clearObsoleteRoomMemory(room) {
  if (room.memory._regenUpgradeLinkDigsite < Game.time - 1000) {
    room.logError(`Clearing obsolete _regenUpgradeLinkDigsite. ` +
        `(${Game.time - room.memory._regenUpgradeLinkDigsite} ticks old)`);
    delete room.memory._regenUpgradeLinkDigsite;
  }
}

function checkWatchdogs(room) {
  if (room.storageCrane &&
      !room.storageCrane.spawning &&
      Game.time > room.memory._storageCraneWatchdog + 25) {
    room.logError(`I think my storageCrane is stuck in state ${room.storageCrane.memory.state} ` +
        `and subState ${room.storageCrane.memory.subState}.`);
  }
}

function maybeActivateSks(room) {
  if (!room.controller.terminal || !room.controller.activeTerminal) return;
  let xy = Nav.roomNameToXY(room.name);
  let cx = xy[0], cy = xy[1];

  for (let y = cy - 2; y <= cy + 2; y++) {
    for (let x = cx - 2; x <= cx + 2; x++) {
      let roomName = Nav.getRoomNameFromXY(x, y);
      if (Nav.getRoomDistanceManhattan(roomName, room.name) > 2) continue;
      if (!roomName.isSkLair()) continue;
      if (Memory.rooms[roomName].execute) continue;
      if (Memory.rooms[roomName].mine) continue;
      // TODO: Check for enemy players working the room.
      room.logError(`Enabling mine on ${roomName}`);
      Memory.rooms[roomName].mine = {};
      Observe.setNextScan(roomName, 1);
    }
  }
}

let validBaseKeys = ['_boostQueue', '_factory', '_feedUpgradeLink', '_last',
    '_lastConstructTime', '_lastDestructTime', '_lastHostileCreep', '_lastLevelChange', '_lastRampartTo100k',
    '_lastVisible', '_nextMaintenanceTime', '_nextScan', '_regenUpgradeLinkDigsite', '_storageCraneWatchdog', 'basecourierIdlePos',
    'baseType', 'boostLab', 'boostloaderPos', 'boostPos', 'builderModel', 'bunkerCenter', 'code', 'controllerPos', 'cranePosition', 'digsites', 'execute',
    'experiments', 'factoryServerPosition', 'ignoreNukes', 'isVault', 'labs', 'loaderIdlePos', 'loot',
    'maxBalanceDistance', 'mineHarassers', 'mineInvaders', 'noLoaders', 'noPowerFarming', 'nuker', '_excessMineralType',
    'orientation', 'oldLevel', 'operateSpawnUntil', 'operateTowersUntil', 'rampartMultipliers', 'role', 'triggerRamparts', 'upgrade'];
let invalidBaseKeys = ['_lastAutobuild', 'claimController', 'claimerSource', 'fight', 'lastBuilder', 'lastRecycle', 'noAvoid', 'noRepair', 'scout', 'towerPositions',];
function checkWeirdKeys(room) {
  if (room.memory.orientation &&
      room.terminal &&
      room.terminal.my &&
      room.bunkerCenter &&
      room.terminal.pos.getRangeTo(room.bunkerCenter) == 2) {
    room.logError(`Deleting no-longer-needed room.memory.orientation key`);
    delete room.memory.orientation;
  }

  if (room.memory._lastHostileCreep < Game.time - 1000) {
    delete room.memory._lastHostileCreep;
  }

  if (room.controller.level == 8) {
    if (room.memory.cranePosition) {
      if (room.baseType == 'bunker') {
        room.logError(`Clearing unnecessary cranePosition`);
        delete room.memory.cranePosition;
      }
    }

    if (room.memory.basecourierIdlePos && room.baseType == 'bunker') {
      room.logError(`Clearing unnecessary basecourierIdlePos`);
      delete room.memory.basecourierIdlePos;
    }
  }

  if (room.memory._allClearTime && !room.memory._alertCondition) {
    room.logError(`I have an old (${Game.time - room.memory._allClearTime} ticks) allClearTime. Deleting.`);
    delete room.memory._allClearTime;
  }

  let myKeys = _.keys(room.memory);
  let purgeKeys = _.intersection(myKeys, invalidBaseKeys);

  if (purgeKeys.length) {
    for (let key of purgeKeys) {
      room.logError(`deleting invalid base key ${key}`);
      delete room.memory[key];
    }
  }

  myKeys = _.keys(room.memory);

  let weirdKeys = _.difference(myKeys, validBaseKeys);
  if (weirdKeys.length) {
    room.logError(`I have weird keys: ${weirdKeys}`);
  }
}

function checkMineralSite(room) {
  if (room.controller.level < 6) return;

  if (!room.extractor) {
    room.logError(`Room lacks extractor`);
    return;
  }

  if (!room.mineralContainer) {
    room.logError(`Room lacks mineral container.`);
    return;
  }
}

function checkDigsiteMemory(room) {
  let mineralId = room.mineral.id;

  if (!room.memory.digsites) {
    room.logError(`Room lacks digsites mem.`);
    return;
  }

  if (!room.memory.digsites[mineralId]) {
    room.logError(`Room lacks digsite record for its mineral.`);
    return;
  }

  // This is a thing that has actually happened. I don't know how.
  if (!room.memory.digsites[mineralId].mineralId) {
    room.logError(`Room mineral digsite record lacks mineralId. Correcting.`);
    room.memory.digsites[mineralId].mineralId = mineralId;
    return;
  }

  if (room.memory.digsites[mineralId].mineralId != mineralId) {
    room.logError(`Room mineral digsite mineralId is wrong. Correcting.`);
    return;
  }
}

function dumpScraps(room) {
  if (!room.activeTerminal ||
      room.terminal.busy ||
      room.terminal.cooldown ||
      room.isVault ||
      !room.nearestVault) {
    return;
  }

  if (room.memory.labs && room.memory.labs.orders && room.memory.labs.orders.length) {
    return;
  }

  let trash = ['ZK', 'UL', 'UH', 'UO', 'KH', 'KO', 'LH', 'LO', 'ZH', 'ZO', 'GH', 'GO',
      'UH2O', 'UHO2', 'KH2O', 'KHO2', 'LH2O', 'LHO2', 'ZH2O', 'ZHO2', 'GH2O', 'GHO2'];

  let keys = _.keys(room.terminal.store);
  let trashKeys = _.intersection(keys, trash);
  let key = trashKeys[0];
  if (!key) return;

  //room.logError(`(dumpScraps) Sending all ${key} (${room.terminal.store[key]}) to vault.`)
  let result = room.terminal.mySend(key, room.terminal.store[key], room.nearestVault.name, 'dumpScraps');
  if (result != OK) {
    room.logError(`Failed to dump scraps to vault: ${result}`)
  }
  return result;
}

/**
 * Check for unusual excesses of basic minerals other than our native mineral. This can happen
 * as a result of looting, market operations, or gifts from other players.
 */
function checkMineralExcesses(room) {
  for (let resource of ['U', 'Z', 'K', 'L', 'O', 'H', 'X']) {
    if (resource != room.nativeMineral &&
        room.storage.store[resource] > 10000 &&
        room.roughInventory(resource) > (room.resourceLimits[resource] + room.idealAmounts[resource]) / 2) {
      if (room.memory._excessMineralType != resource) {
        room.invalidateResourceLimitsCache();
        //room.logError(`I have an unusual excess of ${resource}. amt=${room.roughInventory(resource)}, limits = ` +
        //    ` ${room.idealAmounts[resource]} / ${room.resourceLimits[resource]}`);
        room.memory._excessMineralType = resource;
      }
      return;
    }
  }
  if (room.memory._excessMineralType) {
    room.invalidateResourceLimitsCache();
    //room.logError(`I've cleared my excess of ${room.memory._excessMineralType}`);
    room.memory._excessMineralType = undefined;
  }
}

// Do pretty frequent stuff. Gets called on any given base every 10 ticks.
function do10(room) {
  try {
    Autobuild.update(room);
    let t0 = Game.cpu.getUsed();
    dumpExcess(room);
    Memory.profile.dumpExcess += Game.cpu.getUsed() - t0;
    makeLoaders(room);
    makeBuildersLowRcl(room);
    shuntEnergy(room);
    checkWatchdogs(room);
  } catch (err) {
    room.logError(`do10 error: ${err}`);
  }
}

// Do moderately infrequent stuff. Gets called on any given base every 100 ticks.
function do100(room) {
  try {
    Digsite.updateRoom100(room);
    updateLabOrders(room);
    makeBuilders(room);
    checkRoomLevel(room);
    complainAboutDeficits(room);
    checkLabExecute(room);
    Sharders.update(room);
    updateBuyOrders(room);
    makeBuildersLw(room);
    room.clearUpgradePositionsCache();
    checkMineralExcesses(room);
  } catch (err) {
    room.logError(`do100 error: ${err}`);
  }
}

// Do infrequent stuff. Gets called on any given base every 839 ticks.
function do839(room) {
  try {
    if (room.links.length + room.memory.silentLinks < room.maxLinks) {
      room.logError(`I could build more links.`);
    }

    if (room.memory.sourceRoom) {
      room.logError('I have a sourceRoom set, which is pretty weird for a base.');
    }

    Digsite.updateRoom839(room);
    //updateLabOrders(room);
    shuntEnergyLw(room);
    updateTriggerRamparts(room);
    scoutNeighbors(room);
    checkBalance(room);
    checkServingController(room);
    ServeController.update(room);
    maybeClearBasecourierIdlePos(room);
    maybeClearBunkerCenter(room);
    checkBasecourierModel(room);
    checkDumbContainers(room);
    updateWeakRoadsCache(room);
    trimUpgradePositions(room);
    PowerBank.checkPowerFarms(room);
    checkLwContainerJunk(room);
    clearObsoleteRoomMemory(room);
    dumpExcessLw(room);
    maybeActivateSks(room);
    checkWeirdKeys(room);
    checkDigsiteMemory(room);
    checkMineralSite(room);
    Safemode.baseUpdate(room);
    dumpScraps(room);
  } catch (err) {
    room.logError(`do839 error: ${err}`);
  }
}

function run(room) {
  let tPrev = Game.cpu.getUsed();
  let lastSuccess = ``;
  
  function prof(label) {
    lastSuccess = label;
    let tf = Game.cpu.getUsed();
    Memory.profile.baseDetail[label] = (Memory.profile.baseDetail[label] || 0) + (tf - tPrev);
    tPrev = tf;
  }

  if (!room.controller || !room.controller.my || !room.controller.level) {
    room.logError(`Invalid base. Setting execute false.`);
    room.memory.execute = false;
    return;
  }

  Observe.setNextScan(room.name, 10);

  if (!Memory.profile.baseDetail) {
    Memory.profile.baseDetail = {};
  }
  try {
  parseEventLog(room);
  prof('parseEventLog');

  checkThreat(room);
  prof('checkThreat');
  
  updateAlertCondition(room);
  prof('updateAlertCondition');

  runTowers(room);
  prof('runTowers');

  doLinkTransfers(room);
  prof('doLinkTransfers');
  
  balanceEnergy(room);
  prof('balanceEnergy');
  
  updatePowerSpawn(room);
  prof('updatePowerSpawn');
  } catch (err) {
    room.logError(`Base.run Error(0): ${err}`);
  }

  try {

  //sellEnergy(room);
  //prof('sellEnergy');
  
  makeDefenders(room);
  prof('makeDefenders');

  makeFirefighter(room);
  prof('makeFirefigher');

  Digsite.updateRoom(room);
  prof('updateDigsites');
  
  warnAboutNukes(room);
  prof('warnAboutNukes');
  
  maintainRoadsAndContainers(room);
  prof('maintainRoadsAndContainers');
  
  } catch (err) {
    room.logError(`Base.run Error(1): ${err}`);
  }

  try {
  
  observeNormal(room);
  prof('observe');

  updateSafemode(room);
  prof('updateSafemode');
  
  makeUpgraders(room);
  prof('makeUpgraders');
  
  makeBasecourier(room);
  prof('makeBasecourier');

  makeDrones(room);
  prof('makeDrones');
  
  } catch (err) {
    room.logError(`Base.run Error(2): ${err} (after ${lastSuccess})`);
  }

  try {
  
  emptyTerminal(room);
  prof('emptyTerminal');

  } catch (err) {
    room.logError(`Base.run Error(3): ${err}`);
  }

  try {

  Claim.update(room);
  prof('claim');

  Labs.update(room);
  prof('updateLabs');

  Nuker.update(room);
  prof('updateNuker');

  Loot.update(room);

  if (room.factory && room.factory.active) {
    room.factory.update();
    prof('factoryUpdate');
  }

  Boost.drawBoostStuff(room);
  prof('boostStuff');

  Monitor.update(room);
  prof('updateMonitor');

  makeCranes(room);
  prof('makeCranes');

  } catch (err) {
    room.logError(`Base.run Error(4): ${err}`);
  }

  try {

  Shifter.update(room);
  prof('shifter');

  } catch (err) {
    room.logError(`Base.run Error(5): ${err}`);
  }

  return;
}

module.exports = {
  do10,
  do100,
  do839,
  run
};
