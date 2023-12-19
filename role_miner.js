'use strict';

let Alert = require('util_alert');
let SpawnJob = require('util_spawnJob');
let Tug = require('role_tug');
let Varzs = require('util_varzs');


const STATE_BOOST_ALL = 1;
const STATE_DEPLOY = 2;
const STATE_WORK = 3;

function getBody(model) {
  switch (model) {
    case 20: // test
      return [WORK];
    case 1: // unboosted
      return [WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, WORK, WORK,
          WORK, WORK, WORK, CARRY, CARRY];
    default:
      console.log('Miner.getBody error: Unexpected model number (' + model + ')');
      return null;
  }
}

function getDefaultCreateOpts(model) {
  return {
    memory: {
      role: 'miner',
      model: model,
      state: STATE_BOOST_ALL,
      subState: 0,
      holdSpawn: true,
      suppressNotify: true,
    }
  };
}

function getNewName() {
  return getUniqueCreepName('Miner');
}

function requestSpawnRoom(rooms, model, deposit, priority) {
  let name = getNewName();
  let opts = getDefaultCreateOpts(model);
  let body = getBody(model);
  opts.memory.workRoom = deposit.room.name;
  opts.memory.target = deposit.id;
  return SpawnJob.requestSpawn(rooms, body, name, opts, priority);
}

function shouldBoost(creep) {
  // Temp. Halt this for now.
  return false;
  if (creep.room.roughInventory('XUHO2') < 1440) {
    return false;
  }

  let mem = Memory.rooms[creep.memory.workRoom].deposits[creep.memory.target];
  let estBoostedMineRate = 48 * 7 / (mem.lastCooldown + 10);
  let estHaulRate = 1250 / mem.pathCost;
  if (estHaulRate > estBoostedMineRate) {
      //let key = creep.room.name + Alert.Key.BOOST_MINER;
      //let message = `Boosting miner in ${creep.room.name} at t=${Game.time}`;
      //Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.HOURLY, message);
      return true;
  }
  return false; //creep.needsBoostedMove();
}

function runSpawning(creep) {
  if (!(creep.memory.spawnTime <= Memory._lastMinerSpawn)) {
    Memory._lastMinerSpawn = creep.memory.spawnTime;
  }

  if (creep.id && creep.noBoostsRequested && shouldBoost(creep)) {
    creep.requestAllBoosts();
    creep.room.requestBoost(creep);
  }

  if (!creep.memory.tug && creep.memory._lastSpawn) {
    creep.memory.tug = creep.memory._lastSpawn.name;
  }

  let myTug = Game.creeps[creep.memory.tug];

  if (creep.memory._lastSpawn && !myTug) {
    let key = creep.room.name + Alert.Key.NO_TUG;
    let message = `Miner lacks tug in ${creep.room.name} at t=${Game.time}`;
    Alert.notify(Alert.Destination.BOTH, key, Alert.Frequency.DAILY, message);
  }

  if (creep.memory.holdSpawn && myTug && myTug.spawning) {
    let mySpawn = Game.spawns[creep.memory.spawnedBy];
    let tugSpawn = Game.spawns[myTug.memory.spawnedBy];

    if (myTug.memory.holdSpawn &&
        tugSpawn &&
        tugSpawn.spawning &&
        mySpawn &&
        mySpawn.spawning &&
        tugSpawn.spawning.remainingTime <= mySpawn.spawning.remainingTime + 10) {
      delete myTug.memory.holdSpawn;
      tugSpawn.releaseBlock(); // Spawn will do this itself, but it's a tick faster if we do it.
    }
  }

  if (creep.memory.holdSpawn && myTug && !myTug.spawning) {
    let mySpawn = Game.spawns[creep.memory.spawnedBy];

    let requiredRange = creep.room.baseType == 'bunker' ? 1 : 2;

    if (!mySpawn.spawning.remainingTime && creep.pos.getRangeTo(myTug) <= requiredRange) {
      delete creep.memory.holdSpawn;
      // cardinal directions ensures that we emerge within range of tug, if bunker.
      mySpawn.releaseBlock(creep.room.baseType == 'bunker' ? [1,3,5,7] : undefined);
    }
  }
}

function getTugModel(creep) {
  return creep.memory.model;
}

function preUpdate(creep) {
  if (creep.spawning && creep.id && !creep.memory._lastSpawn) {
    let rooms = [creep.room.name];
    let model = getTugModel(creep);
    let priority = SpawnJob.PRIORITY_HIGH;
    Tug.requestSpawnCreep(rooms, model, creep, priority);
  }
}


/** @param {Creep} creep **/
function run(creep) {
  let repeat;
  let maxRepeat = 6;
  let stateLog = [];

  function setState(state) {
    creep.memory.state = state;
    creep.memory.subState = 0;
    repeat = true;
  }

  function getDepositPos() {
    let deposit = Game.getObjectById(creep.memory.target);
    if (deposit) {
      return deposit.pos;
    }

    let mem = Memory.rooms[creep.memory.workRoom] &&
        Memory.rooms[creep.memory.workRoom].deposits &&
        Memory.rooms[creep.memory.workRoom].deposits[creep.memory.target];

    if (mem) {
      return new RoomPosition(mem.pos.x, mem.pos.y, mem.pos.roomName);
    }
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
    let depositPos = getDepositPos();

    if (!depositPos) {
      creep.say('wut?');
      return;
    }

    if (creep.pos.isNearTo(depositPos)) {
      creep.memory.inFinalPosition = true;
      setState(STATE_WORK);
      return;
    }

    creep.destination = {pos: depositPos, range: 1};
  }

  function nudgeWagonsTogether(a, b) {
    // Look for an open spot that's within one tile of me and both wagons.
    let xMin = Math.max(creep.pos.x - 1, a.pos.x - 1, b.pos.x - 1);
    let xMax = Math.min(creep.pos.x + 1, a.pos.x + 1, b.pos.x + 1);
    let yMin = Math.max(creep.pos.y - 1, a.pos.y - 1, b.pos.y - 1);
    let yMax = Math.min(creep.pos.y + 1, a.pos.y + 1, b.pos.y + 1);

    let possibles = [];

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        let pos = creep.room.getPositionAt(x, y);
        if (pos.open &&
          pos.isWalkable() &&
          !pos.isEqualTo(creep.pos)) {
          possibles.push(pos);
        }
      }
    }

    if (possibles.length) {
      b.travelTo2(possibles[0]);
    } else {
      creep.logError(`I can't find a way to shove these wagons together.`);
    }

  }

  function doWork() {
    let roomForMore = creep.store.getFreeCapacity() >= creep.harvestPower / 2;

    let deposit = Game.getObjectById(creep.memory.target);

    // Need to dump if we're too full to harvest more, if our deposit cooldown is longer than our
    // TTL, or if our deposit is gone.
    if (!roomForMore || (creep.ticksToLive < (deposit && (deposit.cooldown !== undefined) || 1500))) {
      if (!creep.store.getUsedCapacity()) {
        // Don't suicide. Maybe a hauler will show up. This path costs very little compute.
        creep.logError(`${creep.pos.link} I think I could suicide.`);
        return;
      }

      // Maybe dump.
      let wagons = creep.pos.findInRange(
          creep.room.ownedCreeps,
          1,
          {filter: c => c.memory.role == 'wagon' && c.memory.depositId == creep.memory.target && /* temp! */ c.memory.state == 5});
      if (!wagons.length) return;

      if (wagons.length == 1) {
        creep.myTransfer(wagons[0], creep.mainCargo());
        return;
      }

      // More than one nearby wagon. Give my stuff to the oldest, and make any younger ones do the same.
      let oldest = _.min(wagons, 'memory.spawnTime');
      creep.myTransfer(oldest, creep.mainCargo());

      let juniorWagonsWithStuff = _.filter(wagons, w => w != oldest && w.store.getUsedCapacity());
      for (let wagon of juniorWagonsWithStuff) {
        creep.logDebug(`${creep.room.link} Forcing ${wagon} to give to ${oldest}`)
        let result = wagon.myTransfer(oldest, wagon.mainCargo());
        if (result == ERR_NOT_IN_RANGE) {
          creep.logDebug(`${creep.pos.link} My wagons are too far apart. (t=${Game.time})`);
          nudgeWagonsTogether(oldest, wagon);
        }
      }
    } else {
      // Maybe dig. (Deposit must exist or we'd have run the above block.)
      if (!deposit.cooldown) {
        let result = creep.harvest(deposit);
        if (result == OK) {
          if (deposit.depositType == RESOURCE_BIOMASS) Varzs.logBiomass(creep.harvestPower / 2);
          if (deposit.depositType == RESOURCE_SILICON) Varzs.logSilicon(creep.harvestPower / 2);
        }
      }
    }
  }

  function doCustom() {
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
      case STATE_WORK:
        doWork();
        break;
      case STATE_AMNESIAC:
        setState(STATE_IDLE);
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
  preUpdate,
  requestSpawnRoom,
  run,
  runSpawning
};