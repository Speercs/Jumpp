'use strict';

let Guardian = require('role_guardian');
let Nav = require('util_nav');
let SpawnJob = require('util_spawnJob');


const State = {
  LURK: 'lurk',
  ORDER: 'order',
  MUSTER: 'muster',
  ENGAGE: 'engage',
  POSTMORTEM: 'postmortem',
  ERROR: 'error',
};

// Reason why we transitioned to the current state.
const Cause = {
  // Initialized to this state.
  INIT: 'init',

  // It's time for another sortie.
  READY: 'ready',
  
  // Failed to spawn a harasser.
  FAILED_SPAWN: 'failed_spawn',

  // Successfully ordered a harasser.
  SPAWN: 'spawn',

  // Guardian died in transit.
  LOST: 'lost',

  // Guardian arrived.
  ARRIVED: 'arrived',

  // Guardian TTLed
  NATURAL: 'natural',

  // Guardian died in room.
  KIA: 'kia',

  // Guardian vanished and I can't figure out why.
  MIA: 'mia', 
};

const SortieResult = {
  SUCCESS: 'success',
  FAILURE: 'failure',
};

// If spawn fails for this many ticks, give up and go to State.POSTMORTEM with cause FAILED_SPAWN.
const SPAWN_TIMEOUT = 200;

function isCreepTagged(creep) {
  return Memory._harass &&
      Memory._harass.taggedCreeps &&
      Memory._harass.taggedCreeps[creep.id];
}

function tagCreep(creep) {
  if (!Memory._harass) {
    Memory._harass = {taggedCreeps:{}};
  }

  Memory._harass.taggedCreeps[creep.id] = Game.time + creep.ticksToLive;
}

const TAG_CLEAN_PERIOD = 500;

function cleanTags() {
  if (!Memory._harass || Memory._harass.lastClean + TAG_CLEAN_PERIOD > Game.time) {
    return;
  }

  Memory._harass.taggedCreeps = _.pick(
      Memory._harass.taggedCreeps,
      expiry => expiry >= Game.time);
  Memory._harass.lastClean = Game.time;
}

function update(room) {
  if (!Game._cleanedTags) {
    Game._cleanedTags = true;
    cleanTags();
  }

  if (!room.memory.harass) {
    return;
  }

  try {
    updateImpl(room);
  } catch (err) {
    room.logError(`Harass error: ${err}`);
  }
}

function updateImpl(room) {
  let mem = room.memory.harass;
  let repeat = false;
  let maxRepeat = 2;

  function setState(newState, cause) {
    let timestamp = Game.time;
    mem.cycle.stateChanges.push({timestamp, newState, cause});
    mem.state = newState;
    mem.cause = cause;
    delete mem.subState;
    repeat = true;
  }

  function error(message) {
    setState(State.ERROR, message);
    throw message;
  }

  function logError(message) {
    room.logError(`(harass) ${message}`);
  }

  function getMyHarassers() {
    return _.filter(
        room.ownedCreeps,
        c => c.memory.role == 'guardian' && c.memory.workRoom == room.name);
  }

  function stateStartTime() {
    return (mem.cycle &&
        mem.cycle.stateChanges &&
        mem.cycle.stateChanges.length &&
        _.last(mem.cycle.stateChanges).timestamp) || 0;
  }

  function initCycle() {
    if (!mem.archive) {
      mem.archive = [];
    }

    if (!mem.numConsecutiveFailures) {
      mem.numConsecutiveFailures = 0;
    }

    if (mem.cycle) {
      mem.archive.unshift(mem.cycle);
      mem.archive = _.slice(mem.archive, 0, 5);
    }

    mem.cycle = {
        stateChanges: [],
        energyCost: 0,
        energyDamage: 0
    };
    setState(State.LURK, Cause.INIT);
  }

  function doLurk() {
    // Long time?
    if (mem.cycle.stateChanges &&
        mem.cycle.stateChanges.length &&
        mem.cycle.stateChanges[0].timestamp < Game.time - 50000) {
      room.logError(`I've been in Harass.lurk for ${Game.time - mem.cycle.stateChanges[0].timestamp} ticks. Shutting down.`);
      Game.notify(`Shutting down automatic harass on ${room.name}.`);
      delete room.memory.harass;
      return;
    }

    // Don't attack if nobody is mining
    if (!getMinesWorking()) {
      return;
    }

    // Don't attack if poor prospects for success.
    if (room.activeTowers.length) return;

    // Don't attack if the last attack ended with a KIA and any of the defenders are still alive.
    if (mem.lastCycleEndCause == Cause.KIA) {
      let estimatedSpawnTime = Guardian.getBody(getGuardianModel()).length * 3;
      // TODO: Fix this.
      let estimatedTravelTime = 200; // Nav.getRoomDistanceManhattan(room.name, mem.cycle.sourceRoom);
 
      if (Game.time + estimatedSpawnTime + estimatedTravelTime < mem.defenderExpireTime) {
        return;
      }
    }

    // Back off in the event of repeated failure.
    if (Game.time - stateStartTime() < mem.numConsecutiveFailures * 1500) {
      return;
    }

    if (room.controller && room.controller.safeMode) {
      return;
    }

    setState(State.ORDER, Cause.READY);
  }

  /**
   * Returns true if any hostile player creep with a WORK part is near a source.
   */
  function getMinesWorking() {
    let sources = room.find(FIND_SOURCES);
    if (!sources.length) {
      return false;
    }

    let enemyMiners = _.filter(
      room.hostilePlayerCreeps,
      c => c.getActiveBodyparts(WORK));

    if (!enemyMiners.length) {
      return false;
    }

    for (let sourceIndex in sources) {
      for (let minerIndex in enemyMiners) {
        if (enemyMiners[minerIndex].pos.isNearTo(sources[sourceIndex])) {
          return true;
        }
      }
    }
  }

  /**
   * Try to order a guardian. Go to MUSTER if successful. Go to POSTMORTEM if we fail and give up.
   */
  function doOrder() {
    if (!mem.subState) {
      initOrder();
    }

    let myCreeps = getMyHarassers();

    if (myCreeps.length) {
      mem.cycle.creeps = [myCreeps[0].name];
      mem.cycle.energyCost = _.sum(myCreeps, c => c.bodyCost());
      setState(State.MUSTER, Cause.SPAWN);
      return;
    }

    if (Game.time > mem.subState.timeout) {
      setState(State.POSTMORTEM, Cause.FAILED_SPAWN);
      return;
    }

    let result = Guardian.requestSpawnRoom(
        [mem.cycle.sourceRoom],
        mem.cycle.guardianModel,
        room.name,
        SpawnJob.PRIORITY_DEFAULT);

    if (result != OK) {
      logError('Failed to spawn Guardian:' + result);
    }
  }

  function getGuardianModel() {
    if (!room.controller) {
      // Use heavies in SK lairs.
      return 11;
    }
    return 26;
    //return 9;
  }

  function initOrder() {
    let guardPosition = roomGuardPosition(room.name);
    if (!guardPosition) {
      error(`guardPosition not found.`);
    }
    
    let closestTerminal = guardPosition.findClosestTerminal();
    if (!closestTerminal) {
      error(`closestTerminal not found.`);
    }

    mem.cycle.sourceRoom = closestTerminal.room.name;
    mem.cycle.guardianModel = getGuardianModel();
 
    mem.subState = {
      timeout: Game.time + SPAWN_TIMEOUT
    }
  }

  /**
   * Wait for the guardian to arrive. Go to ENGAGE if it arrives, and POSTMORTEM if dies before it
   * arrives.
   */
   
  function doMuster() {
    let myCreeps = _.compact(_.map(mem.cycle.creeps, n => Game.creeps[n]));

    if (myCreeps.length > 1) {
      error(`I'm confused. I have multiple harassers.`);
    }

    if (!myCreeps.length) {
      setState(State.POSTMORTEM, Cause.LOST);
      return;
    }

    if (myCreeps[0].room.name == room.name) {
      setState(State.ENGAGE, Cause.ARRIVED);
    }
  }

  /**
   * Wait for the harasser to die. Go to POSTMORTEM when it does.
   */
  function doEngage() {
    if (!mem.subState) {
      initEngage();
    }

    updateEnergyDamage();

    updateDefenderExpireTime();

    let myCreeps = _.compact(_.map(mem.cycle.creeps, n => Game.creeps[n]));

    if (myCreeps.length) {
      // Units are still fighting.
      return;
    }

    let stones = room.find(FIND_TOMBSTONES);
    let myDeadCreep = _.find(stones, s => s.creep.name == mem.cycle.creeps[0]);

    if (!myDeadCreep) {
      setState(State.POSTMORTEM, Cause.MIA);
      return;
    }

    setState(State.POSTMORTEM, myDeadCreep.creep.ticksToLive == 1 ? Cause.NATURAL : Cause.KIA);
    return;
  }

  function initEngage() {
    let sourceIds = _.map(room.find(FIND_SOURCES), 'id');

    mem.subState = {sourceIds};
  }

  function updateSourceDamage(source) {
    if (source.ticksToRegeneration == 1) {
      mem.cycle.energyDamage += source.energy;
    } else if (!source.ticksToRegeneration) {
      mem.cycle.energyDamage += 10;
    }
  }

  function updateStoneDamage(stone) {
    if (stone.deathTime != Game.time - 1) {
      return;
    }

    if (stone.creep.npc || !stone.creep.hostile) {
      return;
    }

    if (isCreepTagged(stone.creep)) {
      // We've already credited this creep's entire spawn cost toward whichever harasser first
      // encountered it.
      return;
    }

    let energyDamage = Math.floor(stone.creep.bodyCost() * stone.creep.ticksToLive / 1500);

    mem.cycle.energyDamage += energyDamage;
  }

  function updateDefenderDamage(creep) {
    if (creep.shootPower || creep.attackPower || creep.healPower) {
      if (isCreepTagged(creep)) {
        // We've already credit this creep's spawn cost to whatever harasser first encountered it.
        return;
      }

      tagCreep(creep);
      mem.cycle.energyDamage += creep.bodyCost();
    }
  }

  function updateEnergyDamage() {
    _.forEach(room.find(FIND_SOURCES), s => updateSourceDamage(s));

    _.forEach(room.find(FIND_TOMBSTONES), s => updateStoneDamage(s));

    _.forEach(room.hostilePlayerCreeps, c => updateDefenderDamage(c));
  }

  function updateDefenderExpireTime() {
    _.forEach(room.hostilePlayerCreeps, function(creep) {
      if (creep.attackPower + creep.shootPower) {
        mem.defenderExpireTime = Math.max(
          mem.defenderExpireTime || 0,
          creep.ticksToLive + Game.time
        );
      }
    });
  }

  function doPostmortem() {
    mem.lastCycleEndCause = mem.cause;

    if (mem.cycle.energyDamage > mem.cycle.energyCost) {
      mem.cycle.sortieResult = SortieResult.SUCCESS;
      mem.numConsecutiveFailures = 0;
    } else {
      mem.cycle.sortieResult = SortieResult.FAILURE;
      mem.numConsecutiveFailures = (mem.numConsecutiveFailures || 0) + 1;
    }

    initCycle();
  }

  do {
    switch (mem.state) {
      case State.LURK:
        doLurk();
        break;
      case State.ORDER:
        doOrder();
        break;
      case State.MUSTER:
        doMuster();
        break;
      case State.ENGAGE:
        doEngage();
        break;
      case State.POSTMORTEM:
        doPostmortem();
        break;
      case State.ERROR:
        break;
      default:
        initCycle();
        break;
    }
    maxRepeat--;
  } while (repeat && maxRepeat);
}

module.exports = {
  update,
};