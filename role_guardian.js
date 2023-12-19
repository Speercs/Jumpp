'use strict';

let SpawnJob = require('util_spawnJob');

let Threat = require('room_components_threat');

const STATE_DEPLOY = 1;
const STATE_MURDER = 2;
const STATE_SKIRMISH = 3;
const STATE_BOOST_ALL = 4;
const STATE_SCOUT = 5;

function getBody(model) {
  switch (model) {
    case 30: // ultralight variant
      return [RANGED_ATTACK, MOVE];
    case 29: // Anti-POB drainer
      return [TOUGH, TOUGH, TOUGH, TOUGH,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL,
          RANGED_ATTACK,
          MOVE, MOVE, MOVE];
    case 28: // boost tester
      return [TOUGH, RANGED_ATTACK, HEAL, MOVE];
    case 27: // RCL-7 killer
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,

          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,

          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL];
    case 26: // Anti-DEADFEED.
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
      
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          
          HEAL, HEAL, HEAL, HEAL, HEAL];
    case 25: // Aundine interdictor.
      return [TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH,
      
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,

          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL];
    case 13: // Special anti-SBense
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,

          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK,

          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,

          HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL];
    case 12: // Special anti-Aethercyn
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,

          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,

          HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL,

          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
    case 11: // Boosted superheavy - more firepower, less heal
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,

          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,

          HEAL, HEAL, HEAL, HEAL, HEAL,      HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL,

          MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE];
    case 10: // special defender
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          MOVE, MOVE, MOVE, MOVE, MOVE,  MOVE, MOVE, MOVE, MOVE, MOVE];
    case 9: // Special anti-explicit
      return [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
          MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE,
          RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
          RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
          RANGED_ATTACK,
          MOVE,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL
      ];
    case 8: // Boosted superheavy.
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,

          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,

          HEAL, HEAL, HEAL, HEAL, HEAL,      HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,      HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL,

          MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE];
    case 7: // RCL6 guard variant
      return [ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,  ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,  ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,  ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,  ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          WORK, WORK, WORK, WORK, WORK,  WORK, WORK, WORK, WORK, WORK];
    case 6: // Scout variant
      return [MOVE];
    case 5: // Boosted single-tower tanker
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        
          MOVE, MOVE, MOVE, MOVE,

          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          MOVE,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL
      ];
    case 4: // Kill his all-ranged
      return [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
          MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE,
          RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
          RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,ATTACK,ATTACK,
          ATTACK,ATTACK,ATTACK,ATTACK,
          MOVE,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL
      ];
    case 3: // Light skirmisher
      return [RANGED_ATTACK,
          MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          MOVE,
          HEAL, HEAL
      ];
    case 2: // Heavy skirmisher
      return [RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
          MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,      MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE,
          RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
          RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,RANGED_ATTACK,
          RANGED_ATTACK,RANGED_ATTACK,
          MOVE,
          HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL, HEAL
      ];
    case 1: // Light variant
      return [TOUGH, TOUGH,
          MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE,
          ATTACK, ATTACK, ATTACK,
          RANGED_ATTACK, RANGED_ATTACK,
          HEAL, HEAL];
    default:
      console.log('Guardian.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'guardian',
      model: model,
      state: STATE_BOOST_ALL,
      subState: 0,
      waypointIndex: 0,
      noRenew: true,
      suppressNotify: true,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Guardian');
}

function requestSpawn(rooms, model, flag, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.flagName = flag.name;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function requestSpawnRoom(rooms, model, workRoom, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.workRoom = workRoom;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function shouldBoost(creep) {
  return creep.needsBoostedMove();
}

function runSpawning(creep) {
	if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
		creep.requestBoost('XGHO2', creep.getActiveBodyparts(TOUGH));
		creep.requestBoost('XZHO2', creep.getActiveBodyparts(MOVE));
		creep.requestBoost('XLHO2', creep.getActiveBodyparts(HEAL));
		creep.requestBoost('XKHO2', creep.getActiveBodyparts(RANGED_ATTACK));
    creep.room.requestBoost(creep);
  }
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 4;
  let myPost = creep.flag ? creep.flag.pos : roomGuardPosition(creep.memory.workRoom);
  
  function myTravelTo(target, range) {
    if (range == undefined) {
      range = 1;
    }
    let allowSK = creep.flag && creep.flag.memory.guardian.allowSK;
    creep.travelTo2(target, {range, allowSK});
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  
  function doBoostAll() {
    creep.checkSuppressNotify();

    if (creep.doBoost() == OK) {
      setState(STATE_DEPLOY);
    }
    return;
  }

  function doDeploy() {
    if (creep.hits < creep.hitsMax) {
      creep.myHeal(creep);
    }
    
    if (creep.shootPower && creep.room.hostilePlayerCreeps.length) {
      let hostilesInRange = creep.pos.findInRange(creep.room.hostilePlayerCreeps, 3);
      if (hostilesInRange.length) {
        creep.myRangedAttack(hostilesInRange[0]);
      }
    }

    if (creep.flag && creep.flag.memory.guardian.waypoints &&
      creep.memory.waypointIndex < creep.flag.memory.guardian.waypoints.length) {
      let currentWaypoint = Game.flags[creep.flag.memory.guardian.waypoints[creep.memory.waypointIndex]];
      if (!currentWaypoint) {
        creep.logError('my flag has a bogus waypoint');
        return;
      }
      if (creep.pos.isNearTo(currentWaypoint)) {
        creep.memory.waypointIndex++;
        repeat = true;
        return;
      } else {
        creep.say(currentWaypoint.name);
        myTravelTo(currentWaypoint);
      }
    } else {
      // Go to my post
      if (creep.pos.roomName == myPost.roomName) {
        if (creep.getActiveBodyparts(ATTACK)) {
          setState(STATE_MURDER);
        } else if (creep.getActiveBodyparts(RANGED_ATTACK)) {
          setState(STATE_SKIRMISH);
        } else {
          setState(STATE_SCOUT);
        }
      } else {
        myTravelTo(myPost, 0);
      }
    }
  }
  
  function doDefend() {
    // Disregard non-threatening creeps.
    if (creep.room.threatLevel == Threat.THREAT_NONE) {
      myTravelTo(myPost, 0);
      if (creep.hits < creep.hitsMax) {
        creep.myHeal(creep);
      }
      return;
    }

    // Disregard creeps on the room edge.
    let hostileCreeps = _.filter(creep.room.hostileCreeps, c => !c.pos.onEdge);
    
    let attackTargets = creep.pos.findInRange(hostileCreeps, 1, {
      filter: (i) => i.bodyTypeHits(HEAL) > 0
    });
    
    if (!attackTargets.length) {
      attackTargets = creep.pos.findInRange(creep.room.hostileCreeps, 1);
    }
    
    if (!attackTargets.length && creep.room.controller && !creep.room.controller.my) {
      attackTargets = creep.pos.findInRange(creep.room.extensions, 1);
    }
    
    if (!attackTargets.length && creep.room.controller && !creep.room.controller.my) {
      attackTargets = creep.pos.findInRange(creep.room.spawns, 1);
    }
    
    // TODO: Sort attackTargets by value. Choose more wounded over less
    // wounded, and choose those without boosted toughs over those with.

    let rangeTargets = creep.pos.findInRange(hostileCreeps, 3, {
      filter: (i) => i.bodyTypeHits(HEAL) > 0
    });
    
    if (!rangeTargets.length) {
      rangeTargets = creep.pos.findInRange(hostileCreeps, 3);
    }
    
    if (!rangeTargets.length && attackTargets) {
      rangeTargets = attackTargets;
    }
    
    // TODO: Sort rangeTargets by value. Choose more wounded over less
    // wounded, and choose those without boosted toughs over those with.

    // Look for wounded friendlies very near
    let patients = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
      filter: (c) => c.hits < c.hitsMax
    });
    
    // If there's a range target, hit it.
    if (rangeTargets.length) {
      creep.myRangedAttack(rangeTargets[0]);
    }
    
    // If there's an attack target, hit it.
    if (attackTargets.length && creep.getActiveBodyparts(ATTACK)) {
      creep.myAttack(attackTargets[0]);
    // Otherwise heal if there's wounded.
    } else if (patients.length && creep.getActiveBodyparts(HEAL)) {
      creep.myHeal(patients[0]);
    }

    // Move toward the nearest enemy healer if there is one, any enemy otherwise,
    // wounded friendly if there's no enemy, and my flag if there's no wounded friendly.
    let moveTarget = creep.pos.findClosestByRange(hostileCreeps, {
      filter: (i) => i.bodyTypeHits(HEAL) > 0
    });
    
    if (!moveTarget) {
      moveTarget = creep.pos.findClosestInRange(hostileCreeps, 8);
      if (moveTarget) {
        creep.logDebug('Moving to nearest hostile.' + moveTarget.id);
      }
    }
    
    if (!moveTarget) {
      moveTarget = creep.room.find(FIND_MY_CREEPS, {
        filter: c => c.hits < c.hitsMax
      })[0];
      if (moveTarget) {
        creep.logDebug('Moving to wounded friendly.');
      }
    }
    
    if (!moveTarget || (creep.flag && creep.flag.memory.guardian.heel)) {
      creep.logDebug('Moving to flag.');
      moveTarget = myPost;
    }
    
    if (moveTarget) {
      myTravelTo(moveTarget, 0);
    }   
  }
  
  function doOccupy() {
    creep.logDebug('doOccupy');
    // Disregard creeps on the room edge.
    let hostileCreeps = _.filter(creep.room.hostileCreeps, c => !c.pos.onEdge);
    
    let attackTargets = [];
    
    if (!attackTargets.length) {
      attackTargets = creep.pos.findInRange(hostileCreeps, 1, {
        filter: c => c.naked && c.healPower > 0
      });
    }
    
    if (!attackTargets.length) {
      attackTargets = creep.pos.findInRange(hostileCreeps, 1, {
        filter: c => c.naked
      });
    }
    
    if (!attackTargets.length) {
      attackTargets = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 1, {
        filter: s => s.naked && s.hostile && s.active && s.hits
      });
    }
    
    if (!attackTargets.length) {
      attackTargets = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 1, {
        filter: s => s.hostile && s.active && s.hits
      });
    }
    
    if (!attackTargets.length) {
      attackTargets = creep.pos.findInRange(creep.room.containers, 1);
    }
    
    // TODO: Sort attackTargets by value. Choose more wounded over less
    // wounded, and choose those without boosted toughs over those with.

    let rangeTargets = creep.pos.findInRange(hostileCreeps, 3, {
      filter: (i) => i.bodyTypeHits(HEAL) > 0
    });
    
    if (!rangeTargets.length) {
      rangeTargets = creep.pos.findInRange(hostileCreeps, 3);
    }
    
    if (!rangeTargets.length) {
      rangeTargets = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3, {
        filter: s => s.hits && s.hostile && s.naked
      });
    }
    
    if (!rangeTargets.length && (creep.hits == creep.hitsMax)) {
      rangeTargets = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3, {
        filter: s => s.hits && s.hostile
      });
    }
    
    if (!rangeTargets.length && attackTargets) {
      rangeTargets = attackTargets;
    }
    
    // TODO: Sort rangeTargets by value. Choose more wounded over less
    // wounded, and choose those without boosted toughs over those with.

    // Look for wounded friendlies very near
    let patients = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
      filter: (c) => c.hits < c.hitsMax
    });

    // If there's a range target, hit it.
    if (rangeTargets.length) {
      if (rangeTargets[0].hits - (rangeTargets[0].incomingDamage || 0) > 0) {
        creep.myRangedAttack(rangeTargets[0]);
      }
    }
    
    let attackTarget = attackTargets[0];
    let armedTarget = attackTarget instanceof StructureTower ||
      (attackTarget instanceof Creep && attackTarget.isFighter());
    
    // If there's an armed attackTarget, hit it.
    if (creep.getActiveBodyparts(ATTACK) && armedTarget) {
      if (attackTarget.hits - (attackTarget.incomingDamage || 0) > 0) {
        creep.myAttack(attackTarget);
      }
    // If a friendly needs healing, heal.
    } else if (patients.length && creep.getActiveBodyparts(HEAL)) {
      creep.myHeal(patients[0]);
    // If there's an attackTarget, hit it.
    } else if (attackTarget) {
      if (attackTarget.hits - (attackTarget.incomingDamage || 0) > 0) {
        creep.myAttack(attackTarget);
      }
    }

    // Move toward the nearest enemy healer if there is one, any enemy
    // (with more than one body) otherwise, wounded friendly if there's no
    // enemy, and my flag if there's no wounded friendly.
    let responseRange = (creep.flag && creep.flag.memory.guardian.tether) || 8;
    
    hostileCreeps = creep.pos.findInRange(hostileCreeps, responseRange);
    
    let moveTarget = creep.pos.findClosestByRange(
      hostileCreeps,
      {filter: (i) => i.bodyTypeHits(HEAL) > 0});

    if (!moveTarget) {
      if (creep.flag && creep.flag.memory.guardian.tether) {
        if (creep.pos.getRangeTo(creep.flag) > creep.flag.memory.guardian.tether) {
          moveTarget = creep.flag;
        }
      }
    }
      
    if (!moveTarget) {
      moveTarget = creep.pos.findClosestByRange(
        FIND_HOSTILE_STRUCTURES,
        {filter: s => s.naked && s.structureType == STRUCTURE_SPAWN && s.pos.tileType == TILE_EXPOSED});
    }
    
    if (!moveTarget) {
      moveTarget = creep.pos.findClosestByRange(
        hostileCreeps,
        {filter: c => c.body.length > 1});
      if (moveTarget) {
        creep.logDebug('Moving to nearest hostile.' + moveTarget.id);
      }
    }
    
    if (!moveTarget) {
      moveTarget = creep.room.find(FIND_MY_CREEPS, {
        filter: c => c.hits < c.hitsMax
      })[0];
      if (moveTarget) {
        creep.logDebug('Moving to wounded friendly.');
      }
    }
    
    if (!moveTarget) {
      moveTarget = creep.pos.findClosestByPath(_.union(creep.room.extensions, creep.room.towers, creep.room.spawns), {
        filter: s => !s.pos.findInRange(s.room.ramparts,0).length
      });
    }
    
    if (!moveTarget) {
      moveTarget = creep.pos.findClosestByPath(FIND_HOSTILE_CONSTRUCTION_SITES, {
        filter: s => s.progress
      });
    }
    
    if (!moveTarget || (creep.flag && creep.flag.memory.guardian.heel)) {
      creep.logDebug('Moving to my post.');
      moveTarget = myPost;
    }
    
    if (moveTarget) {
      creep.logDebug(`moving to ${moveTarget.pos}`);
      myTravelTo(moveTarget);
    }   
  }
  
  function doMurder() {
    // Ignore distractions on the way to the flag room.
    if (creep.room.name != myPost.roomName) {
      creep.logDebug('Moving to flag room.');
      myTravelTo(myPost);
      if (creep.hits < creep.hitsMax) {
        creep.myHeal(creep);
      }
      return;
    }

    if (creep.body.length == 1) {
      myTravelTo(myPost);
    } else if (creep.room.controller &&
        creep.room.controller.level &&
        !creep.room.controller.my) {
      doOccupy();
    } else {
      doDefend();
    }
    
  }

  function doOverseerShoot() {
    let target;
    let towersInRange = creep.pos.findInRange(creep.room.towers, 3);

    // Armed hostile creep.
    target = creep.pos.findClosestByPath(
        creep.room.hostileCreeps,
        {filter: c => c.isFighter()});

    // Naked tower.
    if (!target) {
      target = _.find(towersInRange, t => t.naked && t.active);
    }

    // Tower.
    if (!target) {
      target = _.find(towersInRange);
    }

    // Spawn
    if (!target && creep.room.spawns.length > 1) {
      target = _.find(creep.room.spawns, 'naked');

      if (!target) {
        target = _.find(creep.room.spawns);
      }
    }

    // Extension
    if (!target && creep.room.extensions.length > 20) {
      target = _.find(creep.room.extensions, 'naked');

      if (!target) {
        target = _.find(creep.room.extensions);
      }
    }

    // Creeps near storage.
    if (!target && creep.room.storage) {
      let creepsNearStorage =
          creep.room.storage.pos.findInRange(creep.room.hostilePlayerCreeps, 1);
          
      if (creepsNearStorage.length) {
        target = creepsNearStorage[0];
      }
    }
    
    if (target) {
      creep.myRangedAttack(target);
    }
  }

  function doOverseerMove() {
    let range = 1;

    // Armed hostile creep.
    let target = creep.pos.findClosestByPath(
      creep.room.hostileCreeps,
      {filter: c => c.isFighter()});

    // Naked tower.
    if (!target) {
      target = _.find(creep.room.towers, t => t.naked && t.active);
    }

    // Tower.
    if (!target) {
      target = _.find(creep.room.towers);
    }

    // Tower construction site.
    let sites;
    if (!target) {
      sites = creep.room.find(FIND_HOSTILE_CONSTRUCTION_SITES);
    
      target = _.find(sites, s => s.structureType == STRUCTURE_TOWER);
      range = 0;
    }

    // Spawn
    if (!target && creep.room.spawns.length > 1) {
      target = _.find(creep.room.spawns, 'naked');

      if (!target) {
        target = _.find(creep.room.spawns);
      }
    }

    // Extension
    if (!target && creep.room.extensions.length > 20) {
      target = _.find(creep.room.extensions, 'naked');

      if (!target) {
        target = _.find(creep.room.extensions);
      }
    }
    
    // Creeps near storage.
    if (!target && creep.room.storage) {
      let creepsNearStorage =
          creep.room.storage.pos.findInRange(creep.room.hostilePlayerCreeps, 1);
          
      if (creepsNearStorage.length) {
        target = creepsNearStorage[0];
      }
    }
    
    // Last spawn
    if (!target && creep.room.spawns.length) {
      target = creep.room.spawns[0];
    }

    if (target) {
      myTravelTo(target, range);
    }
  }

  function doOverseer() {
    // Shoot
    doOverseerShoot();

    // Heal
    if (creep.hits < creep.hitsMax || creep.maxDamage) {
      creep.myHeal(creep);
    }

    // Move
    doOverseerMove();
  }
  
  function doSkirmish() {
    if (creep.room.name != myPost.roomName) {
      setState(STATE_DEPLOY);
      return;
    }

    let hostiles =  creep.room.hostileCreeps;
    let nakedHostiles = _.filter(hostiles, c => c.naked);
    
    // Attack
    let attackTarget;
    let reason = 'none';
    let allCreepsInRange = creep.pos.findInRange(hostiles, 3);
    let nakedCreepsInRange = _.filter(allCreepsInRange, 'naked');
    let healersInRange = _.filter(nakedCreepsInRange, c => c.healPower);
    let woundedInRange = creep.pos.findInRange(creep.room.woundedCreeps, 3);
    let woundedInTouchRange = creep.pos.findInRange(woundedInRange, 1);
    
    if (healersInRange.length) {
      attackTarget = _.min(healersInRange, 'hits');
      reason = 'healersInRange';
    }
    
    if (!attackTarget && nakedCreepsInRange.length) {
      attackTarget = _.min(nakedCreepsInRange, 'hits');
      reason = 'nakedCreepsInRange';
    }
    
    let killStructures = [STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_LINK, STRUCTURE_SPAWN];
    
    let killableStructuresInRange = creep.pos.findInRange(
      FIND_HOSTILE_STRUCTURES,
      /* range = */ 3,
      {filter: s => killStructures.includes(s.structureType)});

    creep.logDebug(_.map(killableStructuresInRange, 'structureType'));

    let killableNakedStructuresInRange = _.filter(killableStructuresInRange, 'naked');
    
    if (!attackTarget && killableNakedStructuresInRange.length) {
      attackTarget = _.min(killableNakedStructuresInRange, 'hits');
      creep.logDebug(`No creep target, trying naked structures, attackTarget = ${attackTarget && attackTarget.structureType}`);
    }
    
    if (!attackTarget && killableStructuresInRange.length) {
      attackTarget = _.min(killableStructuresInRange, 'hits');
      creep.logDebug(`No naked target, trying structures, attackTarget = ${attackTarget && attackTarget.structureType}`);
    }
    
    if (!attackTarget) {
      attackTarget = creep.pos.findClosestByRange(creep.room.ramparts, {filter: s => s.hostile});
    }
    
    let loadedHostileTowers = _.filter(creep.room.towers, t => t.hostile && t.energy >= 10);

    function guardianAttack(target) {
      if (creep.pos.isNearTo(target.pos)) {
        return creep.myRangedMassAttack();
      } else {
        return creep.myRangedAttack(target);
      }
    }
  
    // Heal/attack
    if (woundedInTouchRange.length) {
      let mostHurt = _.min(woundedInTouchRange, 'hits');
      creep.myHeal(mostHurt);
      if (attackTarget) {
        creep.logDebug(`attacking target at ${attackTarget.pos} (1) because ${reason}`);
        guardianAttack(attackTarget);
      }
    } else if (!nakedCreepsInRange.length && woundedInRange.length) {
      let mostHurt = _.min(woundedInRange, 'hits');
      creep.myRangedHeal(mostHurt);
    } else if (nakedCreepsInRange.length || loadedHostileTowers.length || attackTarget) {
      creep.myHeal(creep);
      if (attackTarget) {
        if (attackTarget instanceof Creep && !attackTarget.hostile) {
          creep.logError(`I'm attacking a friendly for some reason wtf?!`);
          creep.memory.debug = true;
        }
        creep.logDebug(`attacking target at ${attackTarget.pos} (2) because ${reason}`);
        guardianAttack(attackTarget);
      }
    }

    // Move
    // Stay out of contact range with hitters. Flee from shooters with more firepower. Close
    // with healers or civilians. If flag's guardian attribute has a 'tether' defined,
    // disregard targets more than 'tether' distance from the flag.
    
    if (creep.memory.freeze) {
      return;
    }
    
    let hittersInRange = _.filter(allCreepsInRange, c => c.attackPower > creep.damageTolerance);
    if (hittersInRange.length) {
      let result = PathFinder.search(
        creep.pos,
        _.map(hittersInRange, function (c) {
          return {pos: c.pos, range: 3}
        }),
        {flee: true});
      let pos = result.path[0];
      creep.move(creep.pos.getDirectionTo(pos));
      return;
    }

    let sites = creep.room.find(
        FIND_HOSTILE_CONSTRUCTION_SITES,
        {filter: s => s.progress > 1000 && s.pos.open});
    if (sites.length) {
      myTravelTo(sites[0], 0);
      return;
    }
    
    let relevantHostiles;
    let nakedHostilesNotOnEdge = _.filter(nakedHostiles, c => !c.onEdge && !c.nearEdge);
    
    if (creep.flag && creep.flag.memory.guardian.tether && creep.flag.room) {
      relevantHostiles = myPost.findInRange(
        nakedHostilesNotOnEdge,
        creep.flag.memory.guardian.tether);
    } else {
      relevantHostiles = nakedHostilesNotOnEdge;
    }

    let shootersWithinFour = creep.pos.findInRange(relevantHostiles, 4, {filter: 'shootPower'});
    let tougherShooters = _.filter(shootersWithinFour, function(enemy) {
      let myArmor = creep.boosted && (creep.body[0].boost == 'XGHO2') ? 0.3 : 1.0;
      let enemyArmor = enemy.boosted && (enemy.body[0].boost == 'XGHO2') ? 0.3 : 1.0;
      let ticksToKillHim = Math.ceil(enemy.hits / Math.max(0, creep.shootPower * enemyArmor - enemy.healPower));
      let ticksToKillMe = Math.ceil(creep.hits / Math.max(0, enemy.shootPower * myArmor - creep.healPower));
      creep.logDebug(`${creep.pos.link} toKillMe: ${ticksToKillMe} toKillHim: ${ticksToKillHim}`);
      return ticksToKillMe < ticksToKillHim;
    });
    if (tougherShooters.length && creep.naked) {
      let result = PathFinder.search(
        creep.pos,
        _.map(tougherShooters, function (c) {
          return {pos: c.pos, range: 4}
        }),
        {flee: true});
      let pos = result.path[0];
      creep.move(creep.pos.getDirectionTo(pos));
      return;
    }
    let killableHostiles = _.filter(relevantHostiles, function(enemy) {
      let enemyArmor = enemy.boosted && (enemy.body[0].boost == 'XGHO2') ? 0.3 : 1.0;
      return creep.shootPower * enemyArmor - enemy.healPower > 0;
    });
    
    let nearestHealer = creep.pos.findClosestByPath(
      killableHostiles,
      {filter: c => c.healPower});
    if (nearestHealer) {
      myTravelTo(nearestHealer);
      return;
    }
    
    let nearestShooter = creep.pos.findClosestByPath(
      killableHostiles,
      {filter: c => c.shootPower});
    if (nearestShooter) {
      myTravelTo(nearestShooter);
      return;
    }
    
    let nearestHitter = creep.pos.findClosestByPath(
      killableHostiles,
      {filter: c => c.attackPower});
    if (nearestHitter) {
      myTravelTo(nearestHitter);
      return;
    }
    
    let nearestCivilianFarFromEdge = creep.pos.findClosestByPath(
      killableHostiles,
      {filter: c => c.body.length > 1 &&
              !c.healPower &&
              !c.attackPower &&
              !c.shootPower &&
              c.pos.x > 8 &&
              c.pos.y > 8 &&
              c.pos.x < 43 &&
              c.pos.y < 43});
    if (nearestCivilianFarFromEdge) {
      myTravelTo(nearestCivilianFarFromEdge);
      return;
    }
    
    let nearestCivilian = creep.pos.findClosestByPath(
      killableHostiles,
      {filter: c => c.body.length > 1 &&
              !c.healPower &&
              !c.attackPower &&
              !c.shootPower &&
              !c.pos.onEdge});
    if (nearestCivilian) {
      myTravelTo(nearestCivilian);
      return;
    }

    let responsePos = (creep.flag && creep.flag.pos) || creep.pos;
    let responseRange = (creep.flag && creep.flag.memory.guardian.tether) || 50;
    
    let nearestNakedSpawn = creep.pos.findClosestByPath(
      responsePos.findInRange(creep.room.spawns, responseRange),
      {filter: s => s.naked && s.hostile});
    if (nearestNakedSpawn) {
      myTravelTo(nearestNakedSpawn);
      return;
    }
    
    let nearestNakedTower = creep.pos.findClosestByPath(
      responsePos.findInRange(creep.room.towers, responseRange),
      {filter: s => s.naked && s.hostile});
    if (nearestNakedTower) {
      myTravelTo(nearestNakedTower);
      return;
    }
    
    let nearestNakedExtension = creep.pos.findClosestByPath(
      responsePos.findInRange(creep.room.extensions, responseRange),
      {filter: s => s.naked && s.hostile});
    if (nearestNakedExtension) {
      myTravelTo(nearestNakedExtension);
      return;
    }
    
    let nearestSpawn = creep.pos.findClosestByPath(
      responsePos.findInRange(creep.room.spawns, responseRange),
      {filter: s => s.hostile});
    if (nearestSpawn) {
      myTravelTo(nearestSpawn);
      return;
    }
    
    let nearestTower = creep.pos.findClosestByPath(
      responsePos.findInRange(creep.room.towers, responseRange),
      {filter: s => s.hostile});
    if (nearestTower) {
      myTravelTo(nearestTower);
      return;
    }
    
    myTravelTo(myPost, 0);
  }

  function doScout() {
    if (creep.room.name != myPost.roomName) {
      myTravelTo(myPost);
      return;
    }

    if (creep.room.controller &&
      (!creep.room.controller.sign || creep.room.controller.sign.username != MY_USERNAME)) {
      if (creep.mySignController(creep.room.controller) == ERR_NOT_IN_RANGE) {
        myTravelTo(creep.room.controller);
        return;
      }
    }

    myTravelTo(myPost);
    return;
  }

  function doAmnesiac() {
    if (creep.boosted) {
      setState(STATE_CUSTOM);
    } else {
      setState(STATE_SKIRMISH);
    }
    return;
  }

  function doCustom() {
  }
    
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_MURDER:
        doMurder();
        break;
      case STATE_SKIRMISH:
        doSkirmish();
        break;
      case STATE_BOOST_ALL:
        doBoostAll();
        break;
      case STATE_SCOUT:
        doScout();
        break;
      case STATE_AMNESIAC:
        doAmnesiac();
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_BOOST_ALL);
        break;
    }
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log('Warning: Creep ' + creep.name + ' maxLooped (' + creep.memory.state + ',' + creep.memory.subState + ')');
  }
}

module.exports = {
  getBody,
  getDefaultCreateOpts,
  getNewName,
  requestSpawn,
  requestSpawnRoom,
  run,
  runSpawning
};