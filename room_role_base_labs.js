'use strict';

// If you've got an unboost creep assigned, be available for unboosting this many ticks before
// the creep's TTL runs out.
const UNBOOST_SAFETY_MARGIN = 50;

function runReactions(room) {
  let labMemory = room.memory.labs;
  if (!labMemory.orders ||
      !labMemory.orders.length ||
      Game.time < labMemory.wake ||
      Game.cpu.bucket < 1000 ||
      !room.destLabs ||
      !room.destLabs.length) {
    labMemory.lastReaction = Game.time;
    return;
  }

  let minCooldown = _.min(room.destLabs, 'cooldown').cooldown;

  if (minCooldown) {
    labMemory.lastReaction = Game.time;
    labMemory.wake = Game.time + minCooldown;
    return;
  }

  if (labMemory.orders.length &&
      (Game.time % 100 == 62) &&
      (Game.time > labMemory.lastReaction + 200) &&
      !Game.shard.ptr) {
    let currentOrderResourceType = labMemory.orders[0].resourceType;
    let thing1 = RECIPES[currentOrderResourceType][0];
    let thing2 = RECIPES[currentOrderResourceType][1];
    if (labMemory.orders[0].reverse) {
      room.logError(`Labs are stalled. ${currentOrderResourceType} ` + 
          `${room.roughInventory(currentOrderResourceType)} ${currentOrderResourceType}`);
    } else {
      room.logError(`Labs are stalled. ${currentOrderResourceType} ${room.roughInventory(thing1)} ` +
          `${thing1}, ${room.roughInventory(thing2)} ${thing2}`);
    }
  }

  // Abort if there's no terminal
  if (!room.terminal) {
    return;
  }

  // Abort if there aren't enough source labs.
  if (room.sourceLabs.length < 2) {
    return;
  }

  if (labMemory.orders[0].reverse) {
    return runReverseReactions(room);
  }

  // Abort if the source labs don't have enough stuff to react.
  if ((room.sourceLabs[0].mineralAmount < 5) || (room.sourceLabs[1].mineralAmount < 5)) {
    return;
  }

  // Abort if the source labs aren't yet stocked with the right ingredients.
  let result = REACTIONS[room.sourceLabs[0].mineralType][room.sourceLabs[1].mineralType];
  if (result != labMemory.orders[0].resourceType) {
    return;
  }

  let maxReactions =
      Math.floor(Math.min(room.sourceLabs[0].mineralAmount, room.sourceLabs[1].mineralAmount) / 5);

  for (let i=0; i < room.destLabs.length && maxReactions; i++) {
    let lab = room.destLabs[i];

    if (lab.cooldown) {
      continue;
    }

    if (lab.mineralAmount && lab.mineralType != result) {
      continue;
    }

    if (lab.creepToUnboost &&
        lab.creepToUnboost.totalTicksToLive < REACTION_TIME[result] + UNBOOST_SAFETY_MARGIN) {
      continue;
    }

    let runResult = lab.runReaction(room.sourceLabs[0], room.sourceLabs[1]);

    if (runResult == OK) {
      labMemory.lastReaction = Game.time;
      --maxReactions;
      labMemory.orders[0].amount -= lab.reactionAmount;

      if (labMemory.orders[0].amount <= 0) {
        labMemory.orders = _.rest(labMemory.orders);
        return;
      }
    } else {
      room.logError('unexpected lab.runReaction result: ' + runResult);
    }
  }
}

function runReverseReactions(room) {
  let labMemory = room.memory.labs;
  let order0 = labMemory.orders[0];
  let resourceType = order0.resourceType;

  // abort if the 'source' labs aren't ready
  let recipe = RECIPES[resourceType];
  let sourceLab0 = room.sourceLabs[0];
  let sourceLab1 = room.sourceLabs[1];
  if (sourceLab0.mineralType && !recipe.includes(sourceLab0.mineralType)) return;
  if (sourceLab1.mineralType && !recipe.includes(sourceLab1.mineralType)) return;
  if (sourceLab0.mineralType && sourceLab0.mineralType == sourceLab1.mineralType) return;

  let maxReactions = Math.floor(order0.amount) / 5;

  for (let i=0; i < room.destLabs.length && maxReactions; i++) {
    let lab = room.destLabs[i];

    if (lab.cooldown) {
      continue;
    }

    if (lab.mineralType != resourceType) {
      continue;
    }

    if (lab.store[resourceType] < lab.reactionAmount) {
      continue;
    }

    if (lab.creepToUnboost &&
        lab.creepToUnboost.totalTicksToLive < REACTION_TIME[resourceType] + UNBOOST_SAFETY_MARGIN) {
      continue;
    }

    let runResult = lab.reverseReaction(room.sourceLabs[0], room.sourceLabs[1]);

    if (runResult == OK) {
      labMemory.lastReaction = Game.time;
      --maxReactions;
      labMemory.orders[0].amount -= lab.reactionAmount;

      if (labMemory.orders[0].amount <= 0) {
        labMemory.orders = _.rest(labMemory.orders);
        return;
      }
    } else {
      room.logError('unexpected lab.reverseReaction result: ' + runResult);
    }
  }
}

let KEY_BOOSTS = [
  {resourceType: 'XUH2O', label: 'attack'},
  {resourceType: 'XKH2O', label: 'carry'},
  {resourceType: 'XLH2O', label: 'repair'},
  {resourceType: 'XLHO2', label: 'heal'},
  {resourceType: 'XZH2O', label: 'dismantle'},
  {resourceType: 'XZHO2', label: 'move'},
  {resourceType: 'XKHO2', label: 'range'},
  {resourceType: 'XGH2O', label: 'upgrade'},
  {resourceType: 'XGHO2', label: 'tough'},
  ];

function workingLabRooms() {
  return _.filter(Game.terminalBases, b => b.memory.labs && b.memory.labs.execute);
}

function t3product(orders) {
  return _.filter(orders, o => o.resourceType[0] == 'X');
}

function boostsCooking() {
  let rooms = workingLabRooms();

  let result = {};

  for (let i in rooms) {
    let room = rooms[i];
    let t3 = t3product(room.memory.labs.orders);
    for (let j=0; j < t3.length; j++) {
      let resourceType = t3[j].resourceType;
      let amount = t3[j].amount;
      if (t3[j].reverse) {
        amount = amount * -1;
      }

      result[resourceType] = (result[resourceType] || 0) + amount;
    }
  }

  return result;
}

function mostUrgentlyNeededBoost() {
  let cooking = boostsCooking();

  let workingTotals = {};

  for (let i in KEY_BOOSTS) {
    let r = KEY_BOOSTS[i].resourceType;

    workingTotals[r] = (roughTotal(r) || 0) + (cooking[r] || 0);
  }

  let lowest = _(workingTotals).pairs().min(p => p[1])[0];

  let maxDesired = Game.terminalBases.length * 8000;

  if (workingTotals[lowest] < maxDesired) {
    return lowest;
  }
}

function update(room) {
  try {
    updateImpl(room);
  } catch (err) {
    room.logError(`(labs) Error: ${err}`);
  }
}

function updateImpl(room) {
  if (!room.memory.labs) {
    room.memory.labs = {};
  }

  if (!room.memory.labs.execute) {
    return;
  }

  runReactions(room);
}

module.exports = {
  KEY_BOOSTS,

  boostsCooking,
  mostUrgentlyNeededBoost,
  update
}