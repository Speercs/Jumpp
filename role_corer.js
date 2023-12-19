'use strict';

let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');


const STATE_BOOST_ALL = 1;
const STATE_DEPLOY = 2;
const STATE_CLEAR = 3;

function getBody(model) {
  switch (model) {
    case 21: // cheap hitter
      return [RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    case 20: // cheap dismantler
      return [WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, HEAL];
    case 19: // glass cannon
      return [RANGED_WORK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
        
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];

    case 5: // level-4 core killer
      return [TOUGH, TOUGH, TOUGH, TOUGH,
          TOUGH, TOUGH, TOUGH, TOUGH,

          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK,

          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
        
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];

    case 4: // level-3 core killer
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK,

          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL,
        
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];

    case 3: // level-2 core killer
      return [TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
        
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,

          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL,
        
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];

    case 2: // level-1 core killer
      return [TOUGH, TOUGH,
        
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK,
          RANGED_ATTACK, RANGED_ATTACK,

          HEAL, HEAL, HEAL, HEAL,
        
          MOVE, MOVE, MOVE, MOVE, MOVE];

    case 1: // level-0 core killer
      return [ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE];
    default:
      console.log('Corer.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model, workRoom) {
  return {
    memory: {
      role: 'corer',
      model: model,
      state: STATE_BOOST_ALL,
      subState: 0,
      workRoom: workRoom,
      suppressNotify: true,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Corer');
}

function requestSpawn(rooms, model, flag, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model, flag.pos.roomName);
  let body = getBody(model);
  opts.memory.flagName = flag.name;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function requestSpawnRoom(rooms, model, workRoom, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model, workRoom);
  let body = getBody(model);

  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function shouldBoost(creep) {
  return creep.needsBoostedMove();
}

function runSpawning(creep) {
  if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.requestAllBoosts();
    creep.room.requestBoost(creep);
  }
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];
  let room = creep.room;

  function myTravelTo(target, options = {}) {
    options.allowSK = true;
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function getCorePosition() {
    if (room.invaderCore) {
      return room.invaderCore.pos;
    }

    if (room.memory.core &&
        room.memory.core.corePos) {
      return room.getPositionAt(room.memory.core.corePos.x, room.memory.core.corePos.y);
    }

    let ruin = room.find(
      FIND_RUINS,
      {filter: r => r.structure.structureType == STRUCTURE_INVADER_CORE})[0];
    let x = ruin.pos.x;
    let y = ruin.pos.y;
    if (room.memory.core) {
      room.memory.core.corePos = {x,y};
    }
    return ruin.pos;
  }
  

  function doBoostAll() {
    creep.checkSuppressNotify();

    if (creep.doBoost() == OK) {
      setState(STATE_DEPLOY);
      return;
    }

    if (creep.ticksToLive < 1350) {
      // Something has gone wrong. Die.
      setState(STATE_DIE);
      return;
    }
  }

  function doDeploy() {
    if (creep.flag) {
      setState(STATE_CUSTOM);
      return;
    }

    if (creep.healPower) {
      if (creep.room.invaderCore || creep.hits < creep.hitsMax || creep.maxDamage) {
        creep.myHeal(creep);
      }
    }

    if (creep.pos.roomName == creep.memory.workRoom) {
      if (creep.memory.model > 1) {
        creep.logDebug(`model-${creep.memory.model} corer reaches work room (${creep.room.link})`);
      }
      setState(STATE_CLEAR);
      return;
    }

    if (creep.memory.model == 21) {
      myTravelTo(roomGuardPosition(creep.memory.workRoom), {roomCallback:RoomCallback.avoidKeepersCallback});
    }
    myTravelTo(roomGuardPosition(creep.memory.workRoom));
  }

  function doClear() {
    switch (creep.memory.model) {
      case 1:
        doClearLevel0();
        break;
      case 2:
      case 3:
        doClearLevel1or2();
        break;
      case 4:
        doClearLevel3();
        break;
      case 5:
        doClearLevel4();
        return;
      case 20:
        doDismantle();
        break;
      case 21:
        doHit();
      default:
        break;
    }
  }

  function doClearLevel0() {
    if (!creep.room.invaderCore) {
      setState(STATE_DIE);
      return;
    }

    let core = creep.room.invaderCore;
    myTravelTo(core, {maxRooms: 1, range: 1});

    creep.myAttack(core);
  }

  function doClearLevel1or2() {
    if (!creep.memory.subState) {
      if (creep.room.invaderCore) {
        creep.memory.subState = 1;
        creep.memory.corePos = creep.room.invaderCore.pos;
      } else {
        // Core is already gone? Could try to mop up, but just go home.
        setState(STATE_DIE);
        return;
      }
    }

    // Done?
    let invaderTowers = _.filter(creep.room.towers, r => r.owner.username == 'Invader');
    if (!room.invaderRamparts.length &&
        !creep.room.invaderCore &&
        !room.nakedInvaders.length &&
        !invaderTowers.length) {
      setState(STATE_DIE);
      return;
    }

    let corePos = creep.room.getPositionAt(creep.memory.corePos.x, creep.memory.corePos.y);
    let coreDistance = creep.pos.getRangeTo(corePos);
    let coreDirection = creep.pos.getDirectionTo(corePos);

    // Move.
    if (coreDistance > 2) {
      myTravelTo(corePos, {maxRooms: 1, range:2});
    } else if (coreDistance > 1) {
      let nextPos = creep.pos.oneStep(coreDirection);
      if (!nextPos.hasRampart()) {
        myTravelTo(nextPos, {maxRooms: 1, range:0});
      }
    } else if (coreDistance == 1) {
      if (!corePos.hasRampart()) {
        myTravelTo(corePos, {maxRooms: 1, range:0});
      }
    }

    // Fight.
    if (coreDistance < 6) {
      creep.myRangedMassAttack();
    }

    creep.myHeal(creep);
  }

  function doClearLevel3() {

    if (creep.pos.roomName != creep.memory.workRoom) {
      setState(STATE_DEPLOY);
      return;
    }
    
    function punchOutCore() {
      if (!room.invaderCore) {
        creep.memory.subState++;
        return;
      }
      myTravelTo(room.invaderCore, {maxRooms: 1, range:3, roomCallback: RoomCallback.avoidBunkersCallback});
      creep.myRangedAttack(room.invaderCore);
    }

    function exposeContainers() {
      // Kill naked invaders. They could block the path to the core ruin.
      let target = creep.pos.findClosestByRange(room.nakedInvaders);

      if (!target) {
        let coveredContainers = _.filter(room.invaderContainers, c => !c.naked);
        target = creep.pos.findClosestByRange(coveredContainers);
      }

      if (creep.myRangedAttack(target) == ERR_NOT_IN_RANGE) {
        myTravelTo(target, {maxRooms: 1, range:3});
      }
    }

    if (!creep.memory.subState) {
      if (creep.room.invaderCore) {
        creep.memory.subState = 1;
        creep.memory.corePos = creep.room.invaderCore.pos;
      } else {
        // Core is already gone? Could try to mop up, but just go home.
        setState(STATE_DIE);
        return;
      }
    }

    // Level-3 is done when the core is dead and no container has a rampart on it.
    if (!room.invaderCore && _.all(room.invaderContainers, 'naked')) {
      setState(STATE_DIE);
      return;
    }

    if (room.invaderCore || (creep.hits < creep.maxHits) || creep.maxDamage) {
      creep.myHeal(creep);
    }

    if (creep.memory.subState == 1) {
      punchOutCore();
    }

    // Note fall-through. If punchOutCore increments subState, exposeContainers will run.

    if (creep.memory.subState == 2) {
      exposeContainers();
    }
  }

  function getPrimaryTarget() {
    if (creep.memory.primaryTarget) {
      let primaryTarget = Game.getObjectById(creep.memory.primaryTarget);
      if (primaryTarget) {
        return primaryTarget;
      }
    }

    // Choose new primary target:
    //  core, if it exists and there's a safe spot within 3 of it.
    //  weakest corner I can get within 3 of, if core exists
    //  critical tile within 1 of core ruin, if core is dead and its tile is EXPOSED.
    //  weakest rampart protecting a container
  }

  function doNewClearLevel4() {
    // Heal
    creep.myHeal(creep);

    let primaryTarget = getPrimaryTarget();
    
    // Go recycle if there is no primary target available.
    if (!primaryTarget) {
      setState(STATE_DIE);
      return;
    }

    // Attack
    //  keeper
    //  naked invader
    //  naked tower
    //  primary target
    //  any rampart over a container
    //  any rampart

    // Move
    //  If not within 3 of primary target, move toward primary target.
  }

  function doClearLevel4() {
    function doKillCorner() {
      creep.myHeal(creep);

      if (!creep.room.invaderCore) {
        creep.memory.subState = 2;
        repeat = true;
        return;
      }

      let dx = -1;
      let dy = -1;

      if (['E26N36'].includes(room.name)) {
        dx = -1;
        dy = 1;
      }

      if (['bar'].includes(room.name)) {
        dx = 1;
        dy = 1;
      }

      let rampartPos = creep.room.getPositionAt(
          creep.room.invaderCore.pos.x + 2 * dx,
          creep.room.invaderCore.pos.y + 2 * dy,
      );

      let rampart = rampartPos.rampart();
      if (!rampart) {
        creep.memory.subState = 1;
        repeat = true;
        return;
      }

      creep.myRangedAttack(rampart);

      let shootPos = creep.room.getPositionAt(
          creep.room.invaderCore.pos.x + 4 * dx,
          creep.room.invaderCore.pos.y + 4 * dy
      );

      myTravelTo(shootPos, {maxRooms: 1, range:0, roomCallback: RoomCallback.avoidKeepersCallback});
    }

    function doKillCore() {
      creep.myHeal(creep);

      if (!creep.room.invaderCore) {
        creep.memory.subState = 2;
        repeat = true;
        return;
      }

      if (creep.myRangedAttack(creep.room.invaderCore) == OK) {
        return;
      }

      let dx = -1;
      let dy = -1;

      if (['E26N36'].includes(room.name)) {
        dx = -1;
        dy = 1;
      }

      if (['bar'].includes(room.name)) {
        dx = 1;
        dy = 1;
      }

      let shootPos = creep.room.getPositionAt(
          creep.room.invaderCore.pos.x + 3 * dx,
          creep.room.invaderCore.pos.y + 3 * dy
      );

      myTravelTo(shootPos, {range:0, roomCallback: RoomCallback.avoidKeepersCallback});
    }

    function doExposeContainers() {
      if (creep.hits < creep.hitsMax) {
        creep.myHeal(creep);
      }

      // Kill naked invaders. They could block the path to the core ruin.
      let target = creep.pos.findClosestByRange(room.nakedInvaders);

      // Kill naked towers. They could block the path to the core ruin.
      if (!target) {
        let nakedTowers = _.filter(room.towers, 'naked');
        if (nakedTowers.length) {
          target = nakedTowers[0];
        }
      }

      let corePosition = getCorePosition();

      if (corePosition.tileType == TILE_EXPOSED) {
        let plugs = corePosition.findInRange(room.criticalTiles, 1);
        if (plugs.length) {
          target = plugs[0].rampart();
        }
      }

      if (!target) {
        let coveredContainers = _.filter(room.invaderContainers, c => !c.naked);
        target = creep.pos.findClosestByRange(coveredContainers);
      }

      if (creep.myRangedAttack(target) == ERR_NOT_IN_RANGE) {
        myTravelTo(target, {range:3});
      }
    }

    switch (creep.memory.subState) {
      case 0:
        doKillCorner();
        break;
      case 1:
        doKillCore();
        break;
      case 2:
        doExposeContainers();
        break;
    }
  }

  function doDismantle() {
    if (creep.healPower) {
      if (creep.room.invaderCore || creep.hits < creep.hitsMax || creep.maxDamage) {
        creep.myHeal(creep);
      }
    }

    let target;

    // Kill naked towers. They could block the path to the core ruin.
    let nakedTowers = _.filter(room.towers, 'naked');
    if (nakedTowers.length) {
      target = nakedTowers[0];
    }

    if (!target) {
      let armoredContainers =
           _.filter(room.invaderContainers, c => !c.naked && c.pos.hasRampart());
      let accessibleArmoredContainers =
          _.filter(armoredContainers, c => c.pos.tileType == TILE_CRITICAL_WALL || c.pos.tileType == TILE_GALLERY);
      if (accessibleArmoredContainers.length) {
        target = accessibleArmoredContainers[0];
      } else if (armoredContainers.length) {
        // There's a container under a rampart but we can't reach it. Look for adjacent critical
        // walls.
        target = _(armoredContainers[0].pos.findInRange(room.criticalTiles, 1))
            .map(t => t.rampart())
            .min('hits');
      }
    }

    if (!target) {
      let corePosition = getCorePosition();
      if (corePosition.tileType == TILE_EXPOSED) {
        let plugs = corePosition.findInRange(room.criticalTiles, 1);
        if (plugs.length) {
          target = plugs[0].rampart();
        }
      }
    }

    if (!target) {
      let tile = creep.pos.findClosestByRange(room.criticalTiles);
      if (tile) {
        target = tile.rampart();
      }
    }

    if (!target) {
      setState(STATE_DIE);
      return;
    }

    if (creep.myDismantle(target) == ERR_NOT_IN_RANGE) {
      myTravelTo(target, {maxRooms: 1, range:1, roomCallback: RoomCallback.avoidKeepersCallback});
    }
  }

  function doHit() {
    creep.logDebug('doHit');
    if (creep.pos.roomName != creep.memory.workRoom) {
      setState(STATE_DEPLOY);
      return;
    }

    let target = creep.pos.findClosestByPath(room.nakedInvaders);

    if (!target) {
      // Too small to be worth recycling.
      creep.logDebug('Suiciding because no targets.');
      creep.suicide();
      return;
    }

    myTravelTo(target, {maxRooms: 1, range:3, roomCallback: RoomCallback.avoidKeepersCallback});
    creep.myRangedAttack(target);
  }

  function doCustom() {
  }
    
  if (creep.memory.model == 1 &&
      Memory.rooms[creep.memory.workRoom].role == 'wilderness' &&
      creep.memory.state != STATE_DIE) {
    creep.logError(`Suicide becuze wtf?`);
    setState(STATE_DIE);
  }

  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_BOOST_ALL:
        doBoostAll();
        break;
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_CLEAR:
        doClear();
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_DIE);
        break;
    }
    stateLog.push({state: creep.memory.state, subState: creep.memory.subState});
  } while (repeat && maxRepeat);
  if (maxRepeat == 0) {
    console.log('Warning: Creep ' + creep.name + ' maxLooped at ' + creep.pos.link);
    console.log(`Warning: Creep ${creep.name} maxLooped at ${creep.pos.link}`);
    stateLog.forEach(function(element) {
      console.log(`state: ${element.state} substate: ${element.subState}`);
    });
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