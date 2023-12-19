'use strict';

let SpawnJob = require('util_spawnJob');


const STATE_INIT = 1;
const STATE_DEPLOY = 2;
const STATE_WORK = 3;

function getBody(model) {
  switch (model) {
    case 2: // test
      return [MOVE, ATTACK];
    case 1:
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK];
    default:
      console.log('Robber.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
        role: 'robber',
        model: model,
        state: STATE_INIT,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Robber');
}

function requestSpawn(rooms, model, workRoom, target, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.workRoom = workRoom;
  opts.memory.target = target;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function runSpawning(creep) {
  if (!creep.room.controller.isPowerEnabled ||
      (creep.room.memory.operateSpawnUntil > Game.time + 10) ||
      (creep.room.find(FIND_MY_POWER_CREEPS).length == 0)) {
    return;
  }

  creep.room.memory.operateSpawnUntil = Game.time + 300;
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 4;
  
  function myTravelTo(target, options = {}) {
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  
  function avoidHostiles() {
    let nearHostiles = creep.pos.findInRange(creep.room.hostileCreeps, 4);
      if (nearHostiles.length) {
        let enemies = _.map(nearHostiles, function(c) {
            return {pos: c.pos, range: 4}
        });
        if (enemies.length) {
          let path = PathFinder.search(creep.pos, enemies, {flee: true, maxRooms: 1});
          let pos = path.path[0];
          creep.move(creep.pos.getDirectionTo(pos));
          return true;
        }
      }
      return false;
  }
  
  function doDeploy() {
    // Get near my bank.
    let bankMem = Memory.rooms[creep.memory.workRoom].powerBanks[creep.memory.target];
    let bankPos = new RoomPosition(bankMem.pos.x, bankMem.pos.y, bankMem.pos.roomName);
        
    if (creep.pos.inRangeTo(bankPos, 8)) {
      setState(STATE_WORK);
    } else {
      myTravelTo(bankPos, {range: 3});
    }
  }
  
  function doWork() {
    let bankMem = Memory.rooms[creep.memory.workRoom].powerBanks[creep.memory.target];
    if (bankMem.state == 'abandoned' || bankMem.state == 'done') {
      setState(STATE_DIE)
      return;
    }

    let nonScoutHostiles = _.filter(creep.room.hostileCreeps, c => c.body.length > 1);
    let hostilesWithinThree = creep.pos.findInRange(nonScoutHostiles, 4);
    let fightersWithinThree =
        _.filter(hostilesWithinThree, c => c.shootPower + c.attackPower + c.healPower);
    let healersWithinThree = _.filter(hostilesWithinThree, c => c.healPower);
    let hostilesWithinOne = creep.pos.findInRange(hostilesWithinThree, 1);
    let healersWithinOne = creep.pos.findInRange(healersWithinThree, 1);
    
    if (fightersWithinThree.length || hostilesWithinOne.length) {
      let moveTarget = healersWithinOne[0] ||
          healersWithinThree[0] ||
          hostilesWithinOne[0] ||
          fightersWithinThree[0];
      myTravelTo(moveTarget);
      if (hostilesWithinOne.length) {
        let attackTarget = healersWithinOne[0] || hostilesWithinOne[0];
        creep.myAttack(attackTarget);
      }
      return;
    }
      
    let powerBank = Game.getObjectById(creep.memory.target);
    if (!powerBank) {
      // Yield to any bankhauler who wants this spot.
      let pushers = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
        filter: c => c.memory.role == 'bankhauler' &&
            c.nextPos &&
            c.nextPos.isEqualTo(creep.pos)
      });
      
      if (pushers.length) {
        myTravelTo(pushers[0].pos);
        return;
      }
    }
      
    let myHealer = creep.pos.findInRange(
        FIND_MY_CREEPS,
        /* range = */ 3,
        {filter: c => c.memory.role == 'bankhealer' && c.memory.robber == creep.id})[0];
    
    if ((!myHealer || creep.pos.getRangeTo(myHealer > 3)) && avoidHostiles()) {
      return;
    }
      
    // If I'm damaged more than 600, something's wrong. Wait and hope for heals.
    let okDamage = creep.getActiveBodyparts(ATTACK) * ATTACK_POWER;
    if (creep.hitsMax - creep.hits > okDamage) {
      return;
    }
    
    if (powerBank) {
      if (!creep.pos.isNearTo(powerBank)) {
        myTravelTo(powerBank, {range:1});
      }

      if (!bankMem.noKill || powerBank.hits > 1800) {
        creep.myAttack(powerBank);
      }
    }
  }
    
  function doCustom() {
  }

  function doInit() {
    creep.notifyWhenAttacked(false);
    setState(STATE_DEPLOY);
  }
    
  do {
    repeat = false;
    maxRepeat--;

    switch (creep.memory.state) {
      case STATE_DEPLOY:
        doDeploy();
        break;
      case STATE_WORK:
        doWork();
        break;
      case STATE_DIE:
        if (creep.memory._trav &&
            creep.memory._trav.path &&
            creep.memory._trav.path.length < creep.ticksToLive + 50) {
          creep.suicide();
          return;
        }
        creep.doDie();
        break;
      case STATE_INIT:
        doInit();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_DEPLOY);
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
  runSpawning,
  run
};