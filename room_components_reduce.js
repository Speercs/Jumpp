'use strict';

function appropriateClaimerModel(room) {
  if (room.controller && room.controller.level) {
    if (room.controller.safeModeAvailable == 0) return 1;
    if (room.controller.level == 8) return 17;
    if (room.controller.level > 3) return 8;
    return 4;
  }

  return 1;
}

function update(room) {
  if (!room.memory.reduce) {
    return;
  }

  if (!room.controller) {
    room.logError(`Deleting memory.reduce from room that lacks controller.`);
    delete room.memory.reduce;
    return;
  }

  if (room.memory.brick) {
    room.logError(`Deleting memory.reduce from room that's getting bricked'.`);
    delete room.memory.reduce;
    return;
  }

  if (room.controller.owner && isFriendly(room.controller.owner.username)) {
    room.logError(`Deleting memory.reduce from friendly base.`);
    delete room.memory.reduce;
    return;
  }

  if (!room.towers.length && !room.spawns.length) {
    if (room.memory.avoid) {
      room.logError(`(reduce) Broken base has avoid set. Fixing.`);
      room.memory.noAvoid = true;
      delete room.memory.avoid;
    }
  }

  if (!room.memory.claimController && !room.controller.my) {
    room.memory.claimController = true;
    room.logError(`(reduce) Setting claimController.`);
  }

  if (!room.memory.attackController && !room.controller.my) {
    room.memory.attackController = true;
    room.logError(`(reduce) Setting attackController.`);
  }

  if (room.controller.level && !room.memory.claimerSource) {
    room.logError(`(reduce) No claimerSource set. Choosing one.`);
    let nearestTerminal = room.controller.pos.findClosestTerminal();
    if (nearestTerminal) {
      room.memory.claimerSource = nearestTerminal.room.name;
    }
  }

  if (room.controller.level) {
    if (!room.memory.claimerModel && Game.time > (room.memory.reduce.claiemrModelupdateTime || 0)) {
      room.logError(`(reduce) claimerModel not set. Initializing.`);
      room.memory.claimerModel = appropriateClaimerModel(room);
      room.memory.reduce.claimerModelUpdateTime = Game.time + 500;
    }
  }

  if (!room.controller.level && room.memory.claimerModel) {
    room.logError(`(reduce) claimerModel not needed anymore. Clearing.`);
    delete room.memory.claimerModel;
  }

  if (!room.controller.owner || room.controller.owner.username != MY_USERNAME) {
    // Not mine yet. Wait.
    room.memory.reduce.state = 'Waiting';
    return;
  }

  if (room.controller.level > 1) {
    room.logError(`(reduce) I'm confused. This is my base, but the level is too high.`)
    return;
  }

  if (room.hostileCreeps.length > 0) return;

  let structures = room.find(
      FIND_STRUCTURES,
      {filter: s => s.structureType != STRUCTURE_CONTROLLER});

  let sites = room.find(FIND_CONSTRUCTION_SITES);

  if (!structures.length && !sites.length && room.controller.unclaim() == OK) {
    room.logError(`Done reducing ${room.name}.`);
    Game.notify(`Done reducing ${room.name}.`);
    room.memory = {};
    return;
  }

  room.logError(`(reduce) Destroying structures.`);
  room.memory.reduce.state = 'Deleting';
  _.forEach(structures, s => s.destroy());

  room.logError(`(reduce) Removing construction sites.`);
  _.forEach(sites, s => s.remove());
}

function shouldReduce(room) {
  if (room.controller && room.controller.level > 5) return false;

  if (room.spawns.length) return false;

  if (!room.controller || !room.controller.level) return false;

  if (isFriendly(room.controller.owner.username)) return false;

  if (NEIGHBORS.includes(room.controller.owner.username)) return false;

  if (room.memory.reduce || room.memory.noReduce) return false;

  if (room.memory.allow) return false;

  return room.newHostileBasesForbidden();
}

module.exports = {
  shouldReduce,
  update,
}
  