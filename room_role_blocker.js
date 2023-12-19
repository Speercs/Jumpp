'use strict';

let Observe = require('util_observe');


function runTowers(room) {
  if (!room.activeTowers.length) {
    return;
  }

  let targets = _.filter(room.hostileCreeps);
  let towers = room.activeTowers;

  let orderedTargets = _.sortBy(targets, c => -c.healPower);

  for (let i = 0; i < orderedTargets.length; i++) {
    let creep = orderedTargets[i];
    let availableTowers = _.filter(towers, t => !t.busy);
    
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

function checkSafemode(room) {
  if (!room.controller ||
      room.controller.safeModeCooldown ||
      room.controller.upgradeBlocked ||
      room.controller.safeMode ||
      !room.controller.safeModeAvailable) {
    return;
  };

  if (room.ramparts.length + room.constructedWalls.length == 0) {
    return;
  }
  
  let rampartAttackEvents = _.filter(
      room.hostileAttackEvents,
      e => Game.getObjectById(e.objectId) &&
          (Game.getObjectById(e.data.targetId).structureType == STRUCTURE_RAMPART ||
          Game.getObjectById(e.data.targetId).structureType == STRUCTURE_WALL));

  if (rampartAttackEvents.length) {
    room.controller.activateSafeMode();
  }
}

function operateRamparts(room) {
  if (room.friendlyPlayerCreeps.length &&
      !room.hostileCreeps.length &&
      room.memory.rampartState != 'open') {
      _.forEach(room.ramparts, r => r.setPublic(true));
      room.memory.rampartState = 'open';
      return;
  }
  
  if (room.hostileCreeps.length &&
      room.memory.rampartState == 'open') {
      _.forEach(room.ramparts, r => r.setPublic(false));
      delete room.memory.rampartState;
  }
}

function run(room) {
  Observe.setNextScan(room.name, 10);
  
  runTowers(room);

  checkSafemode(room);
  
  operateRamparts(room);

  return;
}

module.exports = {
  run
};