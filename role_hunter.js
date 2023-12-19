'use strict';

let RoomCallback = require('util_roomCallback');
let SpawnJob = require('util_spawnJob');


const STATE_DEPLOY = 1;
const STATE_WORK = 2;

function getBody(model) {
  switch (model) {
    case 10: // spawn test
      return [MOVE];
    case 1: // SoloVova model
      return [MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,
          MOVE, MOVE, MOVE, MOVE, MOVE,

          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
          ATTACK, ATTACK, ATTACK,

          HEAL, HEAL, HEAL, HEAL, HEAL,
          HEAL, HEAL];
    default:
      console.log('Hunter.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'hunter',
      model: model,
      state: STATE_DEPLOY,
      subState: 0
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Hunter');
}

function requestSpawn(
      sourceRoom, model, workRoom, lairIds, priority, requestingRoom, requestingComponent) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.workRoom = workRoom;
  opts.memory.lairIds = lairIds;
  opts.requestingRoom = requestingRoom;
  opts.requestingComponent = requestingComponent;
  return SpawnJob.requestSpawn([sourceRoom.name], body, name, opts, priority);
}

/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];

  function myTravelTo(target, options = {}) {
    creep.travelTo2(target, options);
  }

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }
  

  function doDeploy() {
    if (creep.room.name == creep.memory.workRoom) {
      setState(STATE_WORK);
      return;
    }

    myTravelTo(
      new RoomPosition(
          Memory.rooms[creep.memory.workRoom]._lairs[creep.memory.lairIds[0]].sx,
          Memory.rooms[creep.memory.workRoom]._lairs[creep.memory.lairIds[0]].sy,
          creep.memory.workRoom),
      {range:1});
  }

  function getMyLair() {
    let myLairs = [];

    if (creep.memory.lairIds) {
      myLairs = _(creep.memory.lairIds).map(Game.getObjectById).value();
    } else {
      myLairs = creep.room.find(
        FIND_HOSTILE_STRUCTURES,
        {filter: s => s.structureType == STRUCTURE_KEEPER_LAIR});
    }

    if (myLairs.length == 4) {
      let mostRecentlyCleared = _(myLairs).filter(l => !l.keeper).max('ticksToSpawn');
      if (mostRecentlyCleared) {
        let index = _.indexOf(creep.memory.lairIds, mostRecentlyCleared.id);
        return myLairs[(index+1) % 4];
      } else {
        creep.logError(`I haven't recently cleared a lair.`);
      }
    }

    let oldestKeeper = _(myLairs).filter('keeper').min('keeper.ticksToLive');
    if (oldestKeeper != Infinity) {
      return oldestKeeper;
    }

    let nextSpawn = _(myLairs).min(l => l.ticksToSpawn || 0);
    return nextSpawn;
  }

  function doWork() {
    if (creep.room.name != creep.memory.workRoom) {
      creep.logError(`I left my work room, which should be impossible.`);
      setState(STATE_DEPLOY);
      return;
    }

    let myLair = getMyLair();
    if (!myLair) {
      creep.logError(`I have no lair. This should be impossible.`);
      return;
    }

    let woundedCreepsInRange = creep.pos.findInRange(
        creep.room.woundedCreeps,
        3,
        {filter: c => c != creep});

    // Move.
    // close with a live keeper
    if (myLair.keeper && myLair.pos.getRangeTo(myLair.keeper.pos)) {
      myTravelTo(myLair.keeper, {maxRooms:1, range:0});
    // close with wounded friendlies if there's lots of time.
    } else if (!myLair.keeper &&
        woundedCreepsInRange.length &&
        myLair.ticksToSpawn > 50) {
      myTravelTo(woundedCreepsInRange[0], {maxRooms:1, range:1});
    // close with wounded friendlies if I'm max health and there's some time
    } else if (!myLair.keeper &&
        woundedCreepsInRange.length &&
        creep.hits == creep.hitsMax &&
        myLair.ticksToSpawn > 30) {
      myTravelTo(woundedCreepsInRange[0], {maxRooms:1, range:1});
    // adjust position if I'm standing on the container
    } else if (myLair.source.container && creep.pos.isEqualTo(myLair.source.container)) {
      let goals = [{pos: myLair.source.container.pos, range:1}];
      let path = PathFinder.search(
          creep.pos,
          goals,
          {flee: true, maxRooms:1, roomCallback: RoomCallback.avoidMyCreepsCallback});
      myTravelTo(path.path[0], {range:0});
    // close with the lair.
    } else if (myLair.source.container) {
      // TODO: Cache this. Computing it every tick for every guy has got to be stupid expensive.
      let desiredPosition = myLair.source.container.pos.findClosestByPath(myLair.pos.getAdjacentOpenTiles());
      myTravelTo(desiredPosition, {maxRooms:1, range:0});
    // close with the lair.
    } else {
      myTravelTo(myLair, {maxRooms:1, range:1});
    }

    // Die?
    if (myLair && !myLair.keeper && creep.ticksToLive < myLair.ticksToSpawn) {
      creep.suicide();
      return;
    }

    // Attack
    if (myLair.keeper && creep.pos.isNearTo(myLair.keeper)) {
      creep.myAttack(myLair.keeper);
    } else {
      let healTarget = creep.pos.findClosestByRange(woundedCreepsInRange);
      if (healTarget && creep.pos.isNearTo(healTarget)) {
        creep.myHeal(healTarget);
        return;
      }

      // Heal.
      if (creep.hits < creep.hitsMax ||
          (myLair.keeper && creep.pos.getRangeTo(myLair.keeper) <= 3)) {
        creep.myHeal(creep);
        return;
      }

      if (healTarget) {
        creep.myRangedHeal(healTarget);
      }
    }
  }

  function doCustom() {
    //myTravelTo(creep.flag);
    myTravelTo(creep.room.getPositionAt(7,7), {range:0});
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
      case STATE_AMNESIAC:
        setState(STATE_DEPLOY);
        break;
      case STATE_DIE:
        creep.doDie();
        break;
      case STATE_CUSTOM:
        doCustom();
        break;
      default:
        setState(STATE_AMNESIAC);
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
  run
};