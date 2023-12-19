'use strict';

let SpawnJob = require('util_spawnJob');

const STATE_INIT = 3;
const STATE_DEPLOY = 1;
const STATE_WORK = 2;

function getBody(model) {
  switch (model) {
    case 2: // test model
      return [HEAL, MOVE];
    case 1:
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,

          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL, HEAL, HEAL, HEAL];
    default:
      console.log('Healer.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'bankhealer',
      state: STATE_INIT,
      model: model,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Bankhealer');
}

function requestSpawn(rooms, model, workRoom, target, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.workRoom = workRoom;
  opts.memory.target = target;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
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

    if (!nearHostiles.length) {
      return false;
    }

    let enemies = _.map(nearHostiles, function(c) {return {pos: c.pos, range: 4}});

    let path = PathFinder.search(creep.pos, enemies, {flee: true, maxRooms: 1});
    let pos = path.path[0];
    creep.move(creep.pos.getDirectionTo(pos));
    return true;
  }
  
  function doDeploy() {
    if (creep.hits < creep.hitsMax) {
      creep.myHeal(creep);
    }
      
    // Get near my bank.
    let bankMem = Memory.rooms[creep.memory.workRoom].powerBanks[creep.memory.target];
    let bankPos = new RoomPosition(bankMem.pos.x, bankMem.pos.y, bankMem.pos.roomName);
      
    if (avoidHostiles()) {
      return;
    }
    
    if (creep.pos.inRangeTo(bankPos, 8)) {
      setState(STATE_WORK);
    } else {
      myTravelTo(bankPos);
    }
  }
  
  function doWork() {
    let bankMem = Memory.rooms[creep.memory.workRoom].powerBanks[creep.memory.target];
    if (bankMem.state == 'abandoned' || bankMem.state == 'done') {
      setState(STATE_DIE);
      return;
    }

    let powerBank = Game.getObjectById(creep.memory.target);
    if (!powerBank) {
      // Yield to any bankhauler who wants this spot.
      let pushers = creep.pos.findInRange(
          FIND_MY_CREEPS,
          /* range = */ 1,
          {filter: c => c.memory.role == 'bankhauler' &&
              c.nextPos &&
              c.nextPos.isEqualTo(creep.pos)}
      );
      
      if (pushers.length) {
        myTravelTo(pushers[0].pos);
        return;
      }
    }

    let myRobber = Game.getObjectById(creep.memory.robber);

    if (!myRobber) {
      let robbersInRoom = _.filter(
          creep.room.ownedCreeps,
          c => c.memory.role == 'robber' && c.memory.target == creep.memory.target
      );

      let healersInRoom = _.filter(
          creep.room.ownedCreeps,
          c => c.memory.role == 'bankhealer' && c.memory.target == creep.memory.target
      );
           
      let claimedRobbers = _.compact(
          _.map(healersInRoom, function(c) {return Game.getObjectById(c.memory.robber);})
      );
      
      let unclaimedRobbers = _.difference(robbersInRoom, claimedRobbers);

      myRobber = creep.pos.findClosestByRange(unclaimedRobbers);
      if (myRobber) {
        creep.memory.robber = myRobber.id;
      }
    }

    let bankPos = new RoomPosition(bankMem.pos.x, bankMem.pos.y, bankMem.pos.roomName);

    if ((!myRobber || creep.pos.getRangeTo(myRobber > 3)) && avoidHostiles()) {
      return;
    }
      
    // Move.
    if (myRobber) {
      if (myRobber.nextPos && myRobber.nextPos.isEqualTo(creep.pos)) {
        myTravelTo(myRobber, {range: 0});
      } else if (myRobber.nextPos && !myRobber.nextPos.isNearTo(creep)) {
        myTravelTo(myRobber.pos, {range: 0});
      } else if (myRobber.pos.isNearTo(bankPos)) {
        let targetPos = creep.room.getPositionAt(
            myRobber.pos.x * 2 - bankPos.x,
            myRobber.pos.y * 2 - bankPos.y,);

        myTravelTo(targetPos, {range: 0});
      } else {
        myTravelTo(myRobber, {range: 1});
      }
    } else {
      myTravelTo(bankPos, {range: 3});
    }

    // Heal.
    let myDamage = creep.hitsMax - creep.hits;
    if (myDamage) {
      let armedHostiles =
          _.filter(creep.room.hostileCreeps, c => c.attackPower || c.rangedAttackPower);
      if (!armedHostiles.length) {
        creep.myHeal(creep);
        return;
      }
    }
    
    if (myRobber) {
      let robberDamage = myRobber.hitsMax - myRobber.hits;
      if (myDamage > robberDamage) {
        creep.myHeal(creep);
      } else if (creep.pos.isNearTo(myRobber)) {
        creep.myHeal(myRobber);
      } else {
        creep.myRangedHeal(myRobber);
      }
    }
  }

  function doInit() {
    creep.notifyWhenAttacked(false);
    setState(STATE_DEPLOY);
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
  run
};