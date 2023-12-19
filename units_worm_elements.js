'use strict';

let Otacon = require('units_worm_otacon');


function healerHeal(healer, target) {
  if (healer.pos.isNearTo(target)) {
    healer.myHeal(target);
  } else {
    healer.myRangedHeal(target);
  }
}

function doHealerActions(creep) {
  let touchRangeFriendlies = creep.pos.findInRange(creep.room.myCreeps, 1);

  let someHopers = _.filter(
      touchRangeFriendlies,
      c => c.getActiveBodyparts(TOUGH) > 0 || creep.healPower >= c.likelyDamage);
  
  // Adjacent wounded unit, counting likely damage and incoming heals.
  let mostHurt = _.max(someHopers, function(c) {
    return c.hitsMax - (c.hits + c.incomingHeal - c.likelyDamage)
  });
  
  if (mostHurt &&
      mostHurt.hitsMax > mostHurt.hits + mostHurt.incomingHeal - mostHurt.maxDamage) {
    healerHeal(creep, mostHurt);
    return;
  }
  
  let distantFriendlies = creep.pos.findInRange(creep.room.myCreeps, 3);

  // Distant wounded creep, counting likely damage and incoming heals.
  mostHurt = _.max(distantFriendlies, function(c) {
    return c.hitsMax - (c.hits + c.incomingHeal - c.likelyDamage)
  });
  
  if (!creep.isShooting &&
      mostHurt &&
      mostHurt.hitsMax > mostHurt.hits + mostHurt.incomingHeal - mostHurt.likelyDamage) {
    healerHeal(creep, mostHurt);
    return;
  }
  
  // Adjacent wounded friendly, not counting incoming heals.
  mostHurt = _.max(someHopers, function(c) {
    return c.hitsMax - c.hits;
  });
  
  if (mostHurt && mostHurt.hitsMax > mostHurt.hits + mostHurt.incomingHeal) {
    healerHeal(creep, mostHurt);
    return;
  }
  
  // Distant wounded friendly, not counting incoming heals.
  mostHurt = _.max(distantFriendlies, function(c) {
    return c.hitsMax - c.hits;
  });
  
  if (!creep.isShooting &&
      mostHurt &&
      mostHurt.hitsMax > mostHurt.hits + mostHurt.incomingHeal) {
    healerHeal(creep, mostHurt);
    return;
  }
  
  // My wrecker.
  let myWrecker = _.filter(
      someHopers,
      c => c.memory.unit == creep.memory.unit && c.memory.role == 'wrecker')[0];

  if (myWrecker) {
    healerHeal(creep, myWrecker);
    return;
  }
  
  // Any wrecker in touch range.
  let anyWrecker = _.filter(someHopers,  c => c.memory.role == 'wrecker')[0];

  if (anyWrecker) {
    healerHeal(creep, anyWrecker);
    return;
  }

  let hittersUnderThreat = _.filter(someHopers, c => c.hasParts(ATTACK) && c.maxDamage);

  // Any hitter in touch range with nonzero maxDamage and no heals incoming.
  let needyHitter = _.filter(hittersUnderThreat, c => !c.incomingHeal)[0];
  if (needyHitter) {
    healerHeal(creep, needyHitter);
    return;
  }

  // Any hitter in touch range with nonzero maxDamage.
  needyHitter = _.filter(hittersUnderThreat)[0];
  if (needyHitter) {
    healerHeal(creep, needyHitter);
    return;
  } 

  // Myself.
  if (creep.maxDamage) {
    healerHeal(creep, creep);
  }
}

function doHitterActions(creep) {
  let hostiles = creep.pos.findInRange(creep.room.hostileCreeps, 1, {filter: 'naked'});

  // Any enemy creep.
  if (hostiles.length) {
    let target = _.min(hostiles, 'hits');
    creep.myAttack(target);
    creep.memory.previousTarget = target.id;
    return;
  }
  
  // A naked targetable structure
  let nakedStructures = creep.pos.findInRange(
      Otacon.nakedTargetableStructures(creep.room), 1, {filter: 'hostile'});
  
  if (nakedStructures.length) {
    let target = _.min(nakedStructures, 'hits');
    creep.myAttack(target);
    return;
  }

  // A flagged rampart or wall
  let ramparts = creep.pos.findInRange(Otacon.flaggedRampartsAndWalls(creep.room), 1);

  if (ramparts.length) {
    let target = ramparts[0];
    creep.myAttack(target);
    return;
  }

  // A spawn
  let spawns = creep.pos.findInRange(creep.room.spawns, 1, {filter: 'hostile'});
  if (spawns.length) {
    // TODO: Choose the one with the weakest rampart.
    let target = spawns[0];
    creep.myAttack(target);
    return;
  }

  // A tower
  let towers = creep.pos.findInRange(creep.room.activeTowers, 1, {filter: 'hostile'});
  if (towers.length) {
    // TODO: Choose the one with the weakest rampart.
    let target = towers[0];
    creep.myAttack(target);
    return;
  }

  // A naked invader container
  let nakedInvaderContainers =
      creep.pos.findInRange(creep.room.containers, 1, {filter: c => c.naked && c.invader});

  if (nakedInvaderContainers.length) {
    let target = _.min(nakedInvaderContainers, 'hits');
    creep.myAttack(target);
    return;
  }

  // Any rampart or wall.
  ramparts = creep.pos.findInRange(creep.room.ramparts, 1, {filter: 'hostile'});
  let walls = creep.room.hostile ? creep.pos.findInRange(creep.room.constructedWalls, 1) : [];
  let rampartsAndWalls = _.union(ramparts, walls);

  if (rampartsAndWalls.length) {
    let target = _.min(rampartsAndWalls, 'hits');
    creep.myAttack(target);
    return;
  }

  // Any road in a hostile room that isn't on swamp.
  if (creep.room.hostile) {
    let terrain = creep.room.getTerrain();
    let roads = creep.pos.findInRange(
        creep.room.roads,
        1,
        {filter: r => terrain.get(r.pos.x, r.pos.y) != TERRAIN_MASK_SWAMP});
    let road = _.min(roads, 'hits');
    creep.myAttack(road);
    return;
  }
}

function doShooterActions(creep) {
  let hostiles = creep.pos.findInRange(creep.room.hostileCreeps, 3, {filter: 'naked'});

  // An enemy creep other than the one I shot most recently.
  if (hostiles.length > 1 && creep.memory.previousTarget) {
    let otherHostiles = _.filter(hostiles, c => c.id != creep.memory.previousTarget);
    let target = _.min(otherHostiles, 'hits');
    creep.myRangedAttack(target);
    creep.memory.previousTarget = target.id;
    return;
  }

  // Any enemy creep.
  if (hostiles.length) {
    let target = _.min(hostiles, 'hits');
    creep.myRangedAttack(target);
    creep.memory.previousTarget = target.id;
    return;
  }

  // If any enemy creeps or ramparts are within 1, AE.
  if (_.find(hostiles, h => creep.pos.isNearTo(h)) ||
      _.find(creep.room.ramparts, r => r.hostile && creep.pos.isNearTo(r))) {
    creep.myRangedMassAttack();
    return;
  }

  // If at least three critical ramparts or hostile creeps are within 2, AE.
  let criticalRampartsWithinTwo = creep.pos.findInRange(
      creep.room.ramparts,
      2,
      {filter: r => r.hostile && r.pos.tileType == TILE_CRITICAL_WALL});
  let hostilesWithinTwo = creep.pos.findInRange(hostiles, 2);

  if (criticalRampartsWithinTwo.length + hostilesWithinTwo.length > 2) {
    creep.myRangedMassAttack();
    return;
  }

  // A naked targetable structures.
  let nakedStructures = creep.pos.findInRange(
      Otacon.nakedTargetableStructures(creep.room), 3, {filter: 'hostile'});
  
  if (nakedStructures.length) {
    let target = _.min(nakedStructures, 'hits');
    creep.myRangedAttack(target);
    return;
  }

  // A flagged rampart or wall
  let ramparts = creep.pos.findInRange(Otacon.flaggedRampartsAndWalls(creep.room), 3);

  if (ramparts.length) {
    let target = ramparts[0];
    creep.myRangedAttack(target);
    return;
  }

  // Any rampart.
  ramparts = creep.pos.findInRange(creep.room.ramparts, 3, {filter: 'hostile'});
  let walls = creep.room.hostile ? creep.pos.findInRange(creep.room.constructedWalls, 3) : [];
  let rampartsAndWalls = _.union(ramparts, walls);

  // TODO: Maybe ae.
  if (rampartsAndWalls.length) {
    let target = _.min(rampartsAndWalls, 'hits');
    creep.myRangedAttack(target);
    return;
  }
}

function doWreckerActions(creep) {
  // A naked targetable structure
  let nakedStructures = creep.pos.findInRange(
    Otacon.nakedTargetableStructures(creep.room), 1, {filter: 'hostile'});
  
  if (nakedStructures.length) {
    let target = _.min(nakedStructures, 'hits');
    creep.myDismantle(target);
    return;
  }

  // A flagged rampart or wall
  let ramparts = creep.pos.findInRange(Otacon.flaggedRampartsAndWalls(creep.room), 1);

  if (ramparts.length) {
    let target = ramparts[0];
    creep.myDismantle(target);
    return;
  }

  // A spawn
  let spawns = creep.pos.findInRange(creep.room.spawns, 1, {filter: 'hostile'});
  if (spawns.length) {
    // TODO: Choose the one with the weakest rampart.
    let target = spawns[0];
    creep.myDismantle(target);
    return;
  }

  // A tower
  let towers = creep.pos.findInRange(creep.room.activeTowers, 1, {filter: 'hostile'});
  if (towers.length) {
    // TODO: Choose the one with the weakest rampart.
    let target = towers[0];
    creep.myDismantle(target);
    return;
  }

  // A naked invader container
  let nakedInvaderContainers =
      creep.pos.findInRange(creep.room.containers, 1, {filter: c => c.naked && c.invader});

  if (nakedInvaderContainers.length) {
    let target = _.min(nakedInvaderContainers, 'hits');
    creep.myDismantle(target);
    return;
  }

  // A storage or terminal
  let targets = creep.pos.findInRange([creep.room.storage, creep.room.terminal], 1, {filter: 'hostile'});
  if (targets.length) {
    let target = targets[0];
    creep.myDismantle(target);
    return;
  }

  // Any rampart or wall.
  ramparts = creep.pos.findInRange(creep.room.ramparts, 1, {filter: 'hostile'});
  let walls = creep.room.hostile ? creep.pos.findInRange(creep.room.constructedWalls, 1) : [];
  let rampartsAndWalls = _.union(ramparts, walls);

  if (rampartsAndWalls.length) {
    let target = _.min(rampartsAndWalls, 'hits');
    creep.myDismantle(target);
    return;
  }

  // Any road in a hostile room that isn't on swamp.
  if (creep.room.hostile) {
    let terrain = creep.room.getTerrain();
    let roads = creep.pos.findInRange(
        creep.room.roads,
        1,
        {filter: r => terrain.get(r.pos.x, r.pos.y) != TERRAIN_MASK_SWAMP});
    let road = _.min(roads, 'hits');
    creep.myDismantle(road);
    return;
  }
}

module.exports = {
  doHealerActions,
  doHitterActions,
  doShooterActions,
  doWreckerActions
}
